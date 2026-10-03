-- アプリ内課金（App Store）。購入に付ける appAccountToken（UUID）と、だれのものか（メールアドレス）。
-- 月額の更新・解約の知らせ（App Store Server Notifications）が来たとき、ここからだれの会員かを引く
CREATE TABLE app_accounts (
  token      TEXT PRIMARY KEY,
  email      TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX app_accounts_email ON app_accounts (email);
