import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { env, missingKeys } from './config/env';
import './styles.css';

const root = createRoot(document.getElementById('root')!);

// 環境ファイル（../env/<mode>.json）の付け忘れに気付けるようにする
const missing = missingKeys(env);
if (missing.length > 0) {
  console.error(`[App] 環境の設定が足りません: ${missing.join(', ')}`);
  root.render(
    <div className="env-error">
      <h1>環境の設定が足りません</h1>
      <p>env/&lt;環境&gt;.json に次の値を入れて、ビルドし直してください。</p>
      <ul>
        {missing.map((k) => (
          <li key={k}>
            <code>{k}</code>
          </li>
        ))}
      </ul>
    </div>,
  );
} else {
  // 設定が揃ってから Firebase を初期化する（App が config/firebase.ts を読み込む）
  void import('./App').then(({ App }) => {
    root.render(
      <StrictMode>
        <App />
      </StrictMode>,
    );
  });
}
