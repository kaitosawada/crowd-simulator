export const icons = {
  walk: '<svg viewBox="0 0 24 24"><circle cx="14" cy="4" r="2"/><path d="m7 21 3-7m6 7-2-6-3-3 2-6m-7 6 3-4 4-2 3 5 4 1"/></svg>',
  orbit: '<svg viewBox="0 0 24 24"><path d="m3 9 9-5 9 5-9 5-9-5Zm0 5 9 5 9-5M3 18l9 5 9-5" transform="translate(0 -2)"/></svg>',
  pause: '<svg viewBox="0 0 24 24"><path d="M9 5v14M15 5v14" stroke-width="3"/></svg>',
  play: '<svg viewBox="0 0 24 24"><path d="m8 5 11 7-11 7V5Z"/></svg>',
  reset: '<svg viewBox="0 0 24 24"><path d="M4 10a8 8 0 1 1 1 8M4 4v6h6"/></svg>',
  chevron: '<svg viewBox="0 0 24 24"><path d="m9 6 6 6-6 6"/></svg>',
  settings: '<svg viewBox="0 0 24 24"><path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="3"/><circle cx="15" cy="17" r="3"/></svg>',
};
export function buildUI() {
  document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <main class="experience">
    <div id="viewport" aria-label="駅の3Dシミュレーション"></div>
    <button id="panel-toggle" class="panel-toggle" aria-label="設定を開く" aria-controls="settings" aria-expanded="false">${icons.settings}<span>設定</span><kbd>Esc</kbd></button>
    <aside id="settings" class="control-panel" aria-label="ゲーム設定" hidden inert>
      <div class="panel-heading"><span>設定</span><button id="panel-close" class="icon-button" aria-label="設定を閉じる">×</button></div>
      <div class="view-switch" role="group" aria-label="視点"><button id="walk-mode">${icons.walk}<span>プレイヤー</span><kbd>1</kbd></button><button id="overview-mode">${icons.orbit}<span>俯瞰</span><kbd>2</kbd></button></div>
      <div class="population-heading"><label for="population">歩行者</label><span><strong id="population-value">48</strong><small>人</small></span></div>
      <input id="population" type="range" min="0" max="500" step="1" value="48" aria-label="歩行者の人数" />
      <div class="range-labels"><span>0</span><span>250</span><span>500</span></div>
      <p class="field-note">1F改札 → 階段 → 2Fを一周 → 改札<br><span id="flow-status">改札から順次出発します</span></p>
      <div class="presets"><button data-count="24">静かな駅</button><button data-count="100">日常</button><button data-count="350">ラッシュ</button></div>
      <div class="divider"></div>
      <label class="field-label" for="algorithm">歩行アルゴリズム <span class="info-dot" title="NPCごとに独立した行動ロジックを設定できます">i</span></label>
      <div class="select-wrap"><select id="algorithm"></select></div>
      <p class="field-note" id="algorithm-note">進路を予測し、周囲の人をよけながら歩きます。</p>
      <div class="field-label speed-label">シミュレーション速度<span id="speed-value">1.0×</span></div>
      <div class="segmented speed-control" role="group" aria-label="シミュレーション速度"><button data-speed="0.5">0.5×</button><button data-speed="1" class="active">1×</button><button data-speed="2">2×</button></div>
      <div class="divider"></div>
      <label class="toggle-row"><span>進行方向で色分け</span><input id="color-toggle" type="checkbox"/><span class="switch"></span></label>
      <label class="toggle-row"><span>経路を表示</span><input id="route-toggle" type="checkbox"/><span class="switch"></span></label>
      <div class="direction-legend" id="direction-legend" hidden><span><i class="orange"></i>時計回り</span><span><i class="teal"></i>反時計回り</span></div>
      <div class="divider"></div>
      <div class="metrics"><div><span>平均歩行速度</span><strong id="average-speed">0.00 <small>m/s</small></strong></div><div><span>経過時間</span><strong id="elapsed">00:00</strong></div></div>
      <div class="simulation-actions"><button id="pause" class="pause-button">${icons.pause}<span>一時停止</span></button><button id="reset" class="icon-button" aria-label="シミュレーションをリセット" title="リセット">${icons.reset}</button></div>
      <div class="panel-footer"><span id="live-status">進行中</span><span id="fps">— FPS</span></div>
    </aside>
    <section id="map-panel" class="minimap-card" aria-label="コンコースの平面図" hidden><div class="map-heading"><span id="map-floor">1F · 改札</span><span>N ↑</span></div><canvas id="minimap" width="560" height="340"></canvas><div class="map-footer"><span><i></i>現在地</span><span>M 閉じる</span></div></section>
    <div id="crosshair"></div>
    <div id="view-hint">クリックでマウス操作を開始</div>
    <div id="walk-help"><span id="floor-status">1F 改札コンコース</span><span><kbd>W A S D</kbd> 移動</span><span><kbd>Shift</kbd> 速歩き</span><span><kbd>M</kbd> マップ</span><span><kbd>Esc</kbd> 設定</span></div>
    <div id="toast" role="status"></div>
    <div id="loading"><p>読み込み中…</p></div>
  </main>`;
}
