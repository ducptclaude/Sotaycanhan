import CryptoKit
import LocalAuthentication
import Security
import SwiftUI
import WebKit

@main
struct SotaycanhanApp: App {
    var body: some Scene {
        WindowGroup {
            if let value = Bundle.main.object(forInfoDictionaryKey: "SotaycanhanURL") as? String,
               let url = URL(string: value), url.scheme == "https", url.host != nil,
               url.user == nil, url.password == nil {
                NotebookView(url: url)
            } else {
                Text("Chưa cấu hình địa chỉ HTTPS của Sổ Cá Nhân.").padding()
            }
        }
    }
}

struct NotebookView: UIViewRepresentable {
    let url: URL

    func makeCoordinator() -> BiometricBridge {
        BiometricBridge(url: url)
    }

    func makeUIView(context: Context) -> WKWebView {
        let configuration = WKWebViewConfiguration()
        configuration.userContentController.addScriptMessageHandler(
            context.coordinator, contentWorld: .page, name: "sotaycanhanBiometrics"
        )
        let webView = WKWebView(frame: .zero, configuration: configuration)
        webView.navigationDelegate = context.coordinator
        webView.load(URLRequest(url: url))
        return webView
    }

    func updateUIView(_ webView: WKWebView, context: Context) {}

    static func dismantleUIView(_ webView: WKWebView, coordinator: BiometricBridge) {
        webView.configuration.userContentController.removeScriptMessageHandler(
            forName: "sotaycanhanBiometrics", contentWorld: .page
        )
    }
}

final class BiometricBridge: NSObject, WKNavigationDelegate, WKScriptMessageHandlerWithReply {
    private let url: URL
    private let work = DispatchQueue(label: "com.sotaycanhan.biometrics")
    private let publicID = "sotaycanhan.biometric.publicID"
    private let tag = Data("com.sotaycanhan.ios.biometric-key.v1".utf8)

    init(url: URL) {
        self.url = url
    }

    func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction,
                 decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard action.targetFrame?.isMainFrame == true, let target = action.request.url,
              target.scheme == "https", target.host == url.host,
              (target.port ?? 443) == (url.port ?? 443) else {
            decisionHandler(.cancel)
            return
        }
        decisionHandler(.allow)
    }

    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage,
                               replyHandler: @escaping (Any?, String?) -> Void) {
        let origin = message.frameInfo.securityOrigin
        guard message.frameInfo.isMainFrame, origin.protocol == "https", origin.host == url.host,
              (origin.port == 0 ? 443 : origin.port) == (url.port ?? 443),
              let request = message.body as? [String: String], let action = request["action"] else {
            replyHandler(nil, "Nguồn yêu cầu không hợp lệ.")
            return
        }
        work.async {
            do {
                let result = try self.perform(action, challenge: request["challenge"])
                DispatchQueue.main.async { replyHandler(result, nil) }
            } catch {
                DispatchQueue.main.async { replyHandler(nil, error.localizedDescription) }
            }
        }
    }

    private func perform(_ action: String, challenge: String?) throws -> [String: Any] {
        let context = LAContext()
        defer { context.invalidate() }
        context.localizedFallbackTitle = ""
        let available = SecureEnclave.isAvailable && context.canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, error: nil)
        if action == "status" {
            let id = available ? UserDefaults.standard.string(forKey: publicID) : nil
            return ["available": available, "id": id ?? ""]
        }
        if action == "remove" {
            let status = SecItemDelete(keyQuery as CFDictionary)
            guard status == errSecSuccess || status == errSecItemNotFound else {
                throw Failure("Không xoá được khoá trên iPhone.", status: status)
            }
            UserDefaults.standard.removeObject(forKey: publicID)
            return [:]
        }
        guard available else { throw Failure("Face ID / Touch ID không khả dụng hoặc đang bị khóa.") }
        guard ["register", "login", "unlock"].contains(action), let challenge,
              challenge.range(of: "^sotaycanhan:ios:" + action + ":[A-Za-z0-9_-]{43}$", options: .regularExpression) != nil else {
            throw Failure("Thử thách không hợp lệ.")
        }
        var key: SecKey
        if action == "register" {
            do { key = try loadKey(context) }
            catch let failure as Failure where failure.status == errSecItemNotFound {
                try createKey()
                key = try loadKey(context)
            }
        } else {
            key = try loadKey(context)
        }
        let identity = try identity(for: key)
        var error: Unmanaged<CFError>?
        guard let signature = SecKeyCreateSignature(
            key, .ecdsaSignatureMessageX962SHA256, Data(challenge.utf8) as CFData, &error
        ) as Data? else {
            throw Failure("Không xác thực được Face ID / Touch ID. Hãy thử lại hoặc đăng nhập bằng mật khẩu.")
        }
        if action == "register" { UserDefaults.standard.set(identity.id, forKey: publicID) }
        return ["id": identity.id, "publicKey": encode(identity.data), "signature": encode(signature)]
    }

    private var keyQuery: [String: Any] {
        [kSecClass as String: kSecClassKey, kSecAttrKeyType as String: kSecAttrKeyTypeECSECPrimeRandom,
         kSecAttrApplicationTag as String: tag, kSecAttrKeyClass as String: kSecAttrKeyClassPrivate]
    }

    private func loadKey(_ context: LAContext) throws -> SecKey {
        var query = keyQuery
        query[kSecReturnRef as String] = true
        query[kSecUseAuthenticationContext as String] = context
        var result: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &result)
        guard status == errSecSuccess, let result, CFGetTypeID(result) == SecKeyGetTypeID() else {
            throw Failure("Hãy đăng nhập bằng mật khẩu và bật lại Face ID / Touch ID cho iPhone này.", status: status)
        }
        return result as! SecKey
    }

    private func createKey() throws {
        guard let access = SecAccessControlCreateWithFlags(
            nil, kSecAttrAccessibleWhenPasscodeSetThisDeviceOnly, [.privateKeyUsage, .biometryCurrentSet], nil
        ) else { throw Failure("Không tạo được chính sách bảo vệ khóa.") }
        let attributes: [String: Any] = [
            kSecAttrKeyType as String: kSecAttrKeyTypeECSECPrimeRandom,
            kSecAttrKeySizeInBits as String: 256,
            kSecAttrTokenID as String: kSecAttrTokenIDSecureEnclave,
            kSecPrivateKeyAttrs as String: [
                kSecAttrIsPermanent as String: true,
                kSecAttrApplicationTag as String: tag,
                kSecAttrAccessControl as String: access
            ]
        ]
        guard SecKeyCreateRandomKey(attributes as CFDictionary, nil) != nil else {
            throw Failure("Không tạo được khóa trên Secure Enclave.")
        }
    }

    private func identity(for key: SecKey) throws -> (id: String, data: Data) {
        guard let publicKey = SecKeyCopyPublicKey(key),
              let data = SecKeyCopyExternalRepresentation(publicKey, nil) as Data? else {
            throw Failure("Không đọc được khóa công khai.")
        }
        return (encode(Data(SHA256.hash(data: data))), data)
    }

    private func encode(_ data: Data) -> String {
        data.base64EncodedString().replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "/", with: "_").replacingOccurrences(of: "=", with: "")
    }

    private struct Failure: LocalizedError {
        let errorDescription: String?
        let status: OSStatus?

        init(_ message: String, status: OSStatus? = nil) {
            errorDescription = message
            self.status = status
        }
    }
}
