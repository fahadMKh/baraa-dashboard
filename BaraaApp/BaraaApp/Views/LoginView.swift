import SwiftUI

// MARK: - شاشة تسجيل الدخول (إلزامي)
struct LoginView: View {
    @Environment(AuthService.self) private var auth
    @Environment(\.colorScheme) private var scheme

    @State private var username = ""
    @State private var password = ""
    @State private var showError = false
    @State private var isAnimating = false

    var body: some View {
        ZStack {
            AnimatedGradientBackground().ignoresSafeArea()

            ScrollView {
                VStack(spacing: 28) {
                    Spacer().frame(height: 40)

                    // الشعار
                    VStack(spacing: 12) {
                        Image(systemName: "shield.checkered")
                            .font(.system(size: 56))
                            .foregroundStyle(Color.baraTealDark)
                            .symbolEffect(.bounce, value: isAnimating)

                        Text(AppConfig.projectName)
                            .font(.title2.bold())
                            .foregroundStyle(scheme == .dark ? .white : Color.baraTealDark)

                        Text("سجّل دخولك للمتابعة")
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                    }
                    .padding(.bottom, 8)

                    // حقول الإدخال
                    VStack(spacing: 16) {
                        HStack(spacing: 12) {
                            Image(systemName: "person.fill")
                                .foregroundStyle(.secondary)
                                .frame(width: 24)
                            TextField("اسم المستخدم", text: $username)
                                .textInputAutocapitalization(.never)
                                .autocorrectionDisabled()
                        }
                        .padding(14)
                        .background {
                            RoundedRectangle(cornerRadius: 12, style: .continuous)
                                .fill(scheme == .dark ? Color.white.opacity(0.08) : Color.white.opacity(0.8))
                        }
                        .overlay {
                            RoundedRectangle(cornerRadius: 12, style: .continuous)
                                .stroke(Color.primary.opacity(0.1), lineWidth: 1)
                        }

                        HStack(spacing: 12) {
                            Image(systemName: "lock.fill")
                                .foregroundStyle(.secondary)
                                .frame(width: 24)
                            SecureField("كلمة المرور", text: $password)
                        }
                        .padding(14)
                        .background {
                            RoundedRectangle(cornerRadius: 12, style: .continuous)
                                .fill(scheme == .dark ? Color.white.opacity(0.08) : Color.white.opacity(0.8))
                        }
                        .overlay {
                            RoundedRectangle(cornerRadius: 12, style: .continuous)
                                .stroke(Color.primary.opacity(0.1), lineWidth: 1)
                        }
                    }
                    .padding(.horizontal, 4)

                    // رسالة الخطأ
                    if showError {
                        HStack(spacing: 8) {
                            Image(systemName: "exclamationmark.triangle.fill")
                                .foregroundStyle(Color.baraDanger)
                            Text("اسم المستخدم أو كلمة المرور غير صحيحة")
                                .font(.caption)
                                .foregroundStyle(Color.baraDanger)
                        }
                        .transition(.scale.combined(with: .opacity))
                    }

                    // زر الدخول
                    Button {
                        attemptLogin()
                    } label: {
                        HStack(spacing: 8) {
                            Text("تسجيل الدخول")
                                .font(.headline)
                            Image(systemName: "arrow.left.circle.fill")
                        }
                        .frame(maxWidth: .infinity)
                        .padding(14)
                        .background(Color.baraTealDark)
                        .foregroundStyle(.white)
                        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                    }
                    .disabled(username.isEmpty || password.isEmpty)
                    .opacity(username.isEmpty || password.isEmpty ? 0.6 : 1)

                    // ملاحظة
                    VStack(spacing: 6) {
                        Divider().padding(.vertical, 4)

                        HStack(spacing: 6) {
                            Image(systemName: auth.isUnifiedMode ? "globe" : "internaldrive")
                                .foregroundStyle(auth.isUnifiedMode ? .green : .orange)
                            Text(auth.isUnifiedMode ? "تسجيل دخول موحّد" : "تسجيل دخول محلي")
                                .font(.caption.bold())
                                .foregroundStyle(.secondary)
                        }

                        Text("تواصل مع المشرف للحصول على بيانات الدخول")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                            .multilineTextAlignment(.center)
                    }
                    .padding(.top, 8)

                    Spacer()
                }
                .padding(.horizontal, 32)
            }
        }
        .environment(\.layoutDirection, .rightToLeft)
        .onAppear { isAnimating = true }
    }

    private func attemptLogin() {
        withAnimation(.spring(response: 0.3)) {
            showError = false
        }

        let success = auth.login(username: username.trimmingCharacters(in: .whitespaces),
                                  password: password)
        if !success {
            withAnimation(.spring(response: 0.3)) {
                showError = true
            }
            let generator = UINotificationFeedbackGenerator()
            generator.notificationOccurred(.error)
        }
    }
}
