import Foundation
import Capacitor
import AuthenticationServices
import GoogleSignIn

// STUDY TYPE のログイン。どちらも ID トークン（JWT）を返し、サーバー（/app/login）が確かめる。
//   signInApple()                          → { idToken, name }
//   signInGoogle({ clientId, serverClientId? }) → { idToken }
@objc(StudyAuthPlugin)
public class StudyAuthPlugin: CAPPlugin, CAPBridgedPlugin, ASAuthorizationControllerDelegate, ASAuthorizationControllerPresentationContextProviding {
    public let identifier = "StudyAuthPlugin"
    public let jsName = "StudyAuth"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "signInApple", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "signInGoogle", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "signOutGoogle", returnType: CAPPluginReturnPromise)
    ]

    private var appleCall: CAPPluginCall?

    override public func load() {
        // Google のログイン画面から戻ってきた URL を Google Sign-In に渡す
        NotificationCenter.default.addObserver(forName: .capacitorOpenURL, object: nil, queue: .main) { note in
            if let info = note.object as? [String: Any], let url = info["url"] as? URL {
                _ = GIDSignIn.sharedInstance.handle(url)
            }
        }
    }

    // MARK: Apple
    @objc func signInApple(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            self.appleCall = call
            let request = ASAuthorizationAppleIDProvider().createRequest()
            request.requestedScopes = [.fullName, .email]
            let controller = ASAuthorizationController(authorizationRequests: [request])
            controller.delegate = self
            controller.presentationContextProvider = self
            controller.performRequests()
        }
    }

    public func presentationAnchor(for controller: ASAuthorizationController) -> ASPresentationAnchor {
        return self.bridge?.viewController?.view.window ?? ASPresentationAnchor()
    }

    public func authorizationController(controller: ASAuthorizationController, didCompleteWithAuthorization authorization: ASAuthorization) {
        guard let call = appleCall else { return }
        appleCall = nil
        guard let cred = authorization.credential as? ASAuthorizationAppleIDCredential,
              let data = cred.identityToken, let token = String(data: data, encoding: .utf8) else {
            call.reject("Apple のログインがうまくいきませんでした")
            return
        }
        // 名前は初めてのときだけ届く（日本の並び：姓 名）
        let name = [cred.fullName?.familyName, cred.fullName?.givenName].compactMap { $0 }.joined(separator: " ")
        call.resolve(["idToken": token, "name": name])
    }

    public func authorizationController(controller: ASAuthorizationController, didCompleteWithError error: Error) {
        guard let call = appleCall else { return }
        appleCall = nil
        if let e = error as? ASAuthorizationError, e.code == .canceled {
            call.reject("canceled", "canceled")
        } else {
            call.reject("Apple のログインがうまくいきませんでした: " + error.localizedDescription)
        }
    }

    // MARK: Google
    @objc func signInGoogle(_ call: CAPPluginCall) {
        guard let clientId = call.getString("clientId"), !clientId.isEmpty else {
            call.reject("Google のログインは準備中です")
            return
        }
        DispatchQueue.main.async {
            guard let vc = self.bridge?.viewController else { call.reject("画面が見つかりません"); return }
            GIDSignIn.sharedInstance.configuration = GIDConfiguration(clientID: clientId, serverClientID: call.getString("serverClientId"))
            GIDSignIn.sharedInstance.signIn(withPresenting: vc) { result, error in
                if let error = error {
                    if (error as NSError).code == GIDSignInError.canceled.rawValue {
                        call.reject("canceled", "canceled")
                    } else {
                        call.reject("Google のログインがうまくいきませんでした: " + error.localizedDescription)
                    }
                    return
                }
                guard let token = result?.user.idToken?.tokenString else {
                    call.reject("Google のログインがうまくいきませんでした")
                    return
                }
                call.resolve(["idToken": token])
            }
        }
    }

    @objc func signOutGoogle(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            GIDSignIn.sharedInstance.signOut()
            call.resolve()
        }
    }
}
