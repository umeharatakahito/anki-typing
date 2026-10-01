-- 月額プランを解約した（期間の終わりで止まる）印。画面とメールで「解約済み・○日まで使える」と出すため
ALTER TABLE plans ADD COLUMN ending INTEGER NOT NULL DEFAULT 0;
