\# SKG営業会議ダッシュボード - プロジェクト概要



\## 概要

SKグループ営業会議向けの実績・人事ダッシュボード。

URL: https://kasuyakouta.github.io/skg-dashboard/



\## 技術スタック

\- フロント: GitHub Pages上の単一HTMLファイル

\- バックエンド: Google Apps Script (GAS)

\- GAS URL: https://script.google.com/macros/s/AKfycbybAvXkNCx9avzHmPW9HfThs7Z6o5tHHoC\_QkfFcYLXbodTRUhuwbK8tpjno1SYo56\_9g/exec

\- データ保存: Google Sheets(8部署分、部署別に個別スプレッドシートID設定済み)

\- 統合スプレッドシートID: 1pvCvTXBPX28-DgzGmRQMTESUkFcBS\_yfk\_SWQmIcYgY



\## アーキテクチャ上の特徴

\- 8部署のデータを並行JSONP取得方式で取得(部署ごとに個別リクエスト)

\- フラットログ方式(フラットログ\_実績・フラットログ\_人事)でサブ秒レスポンスを実現



\## 必須ルール(標準スタック)

\- iOS Safari互換性・PWA対応を優先の設計制約とする

\- CORSはGAS側をtext/plainコンテントタイプで受けて回避する

\- 日時はローカル時刻で組み立てる(UTCは使わない)

\- 管理者PINは 3150(他アプリと共通)

\- フォントは IBM Plex Sans JP / Noto Sans JP



\## 変更時のお願い

\- 複雑な変更は実装前にオプションA/B形式で提案し、承認を得てから実装する

\- 回答は簡潔に、前置きは省略する

