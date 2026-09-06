# CONCOURSE

Three.js / Vite / TypeScriptで作った、駅の環状コンコースを歩いて群集を観察するシミュレーターです。品川駅の広さ、案内サイン、ガラスの開放感を参考にした架空の駅で、実際の品川駅の平面図を再現したものではありません。

## 起動

Node.js 22.12以上（24.18で検証）。

```sh
npm install
npm run dev
```

表示されたローカルURLを開きます。通常は `http://127.0.0.1:5173` です。

```sh
npm test         # シミュレーションの自動テスト
npm run build    # TypeScriptの型チェックと本番ビルド
npm run preview  # distのローカルプレビュー
```

## できること

- 外寸100 × 68m、中央施設68 × 36m、幅16mの通路を一周できます。
- 木製ルーバー天井、吊り下げ案内板、ガラス壁、ステンレス柱、点字ブロック、店舗ファサード、植栽、ベンチを配置しています。
- 初期48人、0〜500人のNPCが両方向に歩行します。体格・服装・速度に個体差があり、移動距離に合わせて手足が動きます。
- 人との接近を予測する回避と、回避を行わない経路追従を切り替えられます。
- 人数、速度、停止／再開、リセット、進行方向の色分け、代表経路の表示を操作できます。
- 俯瞰モードでは天井が非表示になり、全体の流れを観察できます。
- ミニマップ、平均歩行速度、シミュレーション内の経過時間、描画FPSを表示します。

## 操作

PCのキーボード・マウス操作を前提としています。起動直後から一人称のプレイヤーとして駅に立ち、WASDで歩けます。画面をクリックするとマウスの固定を要求します。設定パネルとミニマップは初期状態では非表示です。

| 操作 | 内容 |
| --- | --- |
| `1` / 設定の「プレイヤー」 | 一人称の歩行モード |
| `WASD` / 矢印キー | 前後左右へ移動 |
| `Shift` | 速歩き |
| マウス | ポインタ固定中に見回す |
| `Esc` / 設定ボタン | ポインタ固定を解除し、設定を開閉 |
| `Tab` | 設定を開く（設定内では通常のフォーカス移動） |
| `M` | ミニマップを表示／非表示 |
| ドラッグ | ポインタ固定が使えない環境でも見回す |
| 画面をクリック | 歩行モードでポインタ固定を要求 |
| `2` / 設定の「俯瞰」 | 俯瞰モード |
| 俯瞰でドラッグ / ホイール / 右ドラッグ | 回転 / ズーム / 平行移動 |
| `Space` | NPCのシミュレーションを停止／再開 |

設定を開くとプレイヤーの移動と見回しを止めます。閉じるとゲーム画面にフォーカスが戻り、移動を再開できます。設定の入力中は移動ショートカットを抑止します。NPCの一時停止中もプレイヤーや観察カメラは動かせます。歩行者はプレイヤーも回避対象として扱います。壁・柱・ベンチ・植栽にはプレイヤーとNPCの両方の当たり判定があります。

## 構成

```text
src/
  main.ts                    描画ループ、照明、UIと各モジュールの接続
  ui.ts / style.css          操作パネルと画面レイアウト
  simulation/                Three.js / DOMに依存しないシミュレーション
    types.ts                 AgentBehaviorなどの公開契約
    Simulation.ts            固定時間刻み、個体管理、行動の差し替え
    behaviors.ts             経路追従・予測回避・アルゴリズム登録
    SpatialHash.ts           空間ハッシュによる近傍検索
    layout.ts                駅寸法、閉経路、共通の障害物と当たり判定
  render/CrowdRenderer.ts    InstancedMeshによる人体と歩行アニメーション
  player/PlayerController.ts 一人称カメラ、キー入力、移動と衝突制約
  world/Station.ts           手続き的な駅の造形
  world/materials.ts         床・案内板のCanvasテクスチャ
```

単位はメートルと秒です。シミュレーションは30Hzの固定ステップで進め、描画はrequestAnimationFrameで独立して更新します。全NPCの判断を、位置の積分より先に行います。近傍の状態はステップ開始時点のスナップショットです。

駅の反復部材は材質ごとに結合しています。NPCは部位ごとのInstancedMeshで描画し、人数に応じてドローコールが増えない構成です。近傍探索は空間ハッシュで絞り込みます。500人まで設定できますが、FPSはGPU、解像度、ブラウザ、アルゴリズムに依存します。

## NPCアルゴリズムを追加する

`AgentBehavior` は個体と周辺状況を受け取り、希望速度 `{ x, z }` を返します。描画オブジェクトを操作する必要はありません。

```ts
import type { AgentBehavior, AgentState, BehaviorContext } from './types';
import { behaviorRegistry } from './behaviors';

class CautiousWalker implements AgentBehavior {
  readonly name = 'cautious';
  // 各NPCに別のインスタンスが作られるため、個体ごとの記憶も持てます。
  private stoppedFor = 0;

  computeVelocity(agent: Readonly<AgentState>, context: BehaviorContext) {
    const close = context.neighbors.some(other =>
      other.id !== agent.id &&
      Math.hypot(
        other.position.x - agent.position.x,
        other.position.z - agent.position.z,
      ) < 1.1
    );
    this.stoppedFor = close ? this.stoppedFor + context.dt : 0;
    const factor = close && this.stoppedFor < 1.5 ? 0 : 0.8;
    return {
      x: context.desiredVelocity.x * factor,
      z: context.desiredVelocity.z * factor,
    };
  }
}

// main.tsのbuildUI後のアルゴリズム一覧生成より前に登録します。
behaviorRegistry.set('cautious', {
  label: '慎重な歩行',
  factory: () => new CautiousWalker(),
});
```

登録された方式は設定の選択肢に現れます。同じ方式を全員に適用するなら `simulation.setAlgorithm('cautious')`、特定の個体だけ変えるなら以下を使います。

```ts
simulation.setAgentBehavior(agentId, () => new CautiousWalker());
```

`context` には `dt`、時刻、経路に沿う希望速度、近傍の位置・速度・半径、円形の障害物が入ります。プレイヤーのIDは `-1` です。壁とベンチの制約は速度の積分後に共通で適用されます。必要なら `layout.ts` の寸法・ベンチ情報を参照して、予測段階の壁回避も追加できます。経路計画自体を変えたい場合は、`Simulation.ts` の希望速度生成部分が拡張箇所です。

リセットと全体アルゴリズム切り替えでは、行動インスタンスを作り直します。個体ごとの独自割り当てもその時点で解除されます。カスタム行動は渡された状態を変更せず、速度を返してください。NaN・Infinityは停止に置き換え、極端な希望速度には上限を適用します。

## 現時点の範囲

予測回避は軽量なヒューリスティックです。ORCA/RVOや較正済みのSocial Force Modelではなく、密集時の人体同士の非貫通を数学的に保証しません。「経路追従のみ」では比較のため、人同士を回避しません。避難時間や実駅の安全性を評価するモデルとしては設計していません。

現在は単一階の一周する通路に絞っています。改札・階段・ホームへの移動、目的地ごとの経路探索、アニメーション付きの外部人体モデルは含めていません。3Dモデルとテクスチャはローカルで生成し、フォントはシステムフォントを使います。外部の素材やフォントのダウンロードは不要です。

## 検証

`npm test` は閉経路と全レーンの連続性・通行可能性、静的障害物の制約、空間ハッシュの境界、24人の一周以上の歩行、停止／倍速／リセット、プレイヤーへの予測回避、独立したカスタム行動、500人の状態の健全性を検証します。本番ビルドではTypeScriptの型チェックも実施します。

ブラウザでは歩行・俯瞰・人数変更（500人）・速度・アルゴリズム切り替え・色分け・経路表示・停止を確認しています。

プレイヤー操作の回帰テストでは、起動直後のWASD移動、設定中の移動停止、キー状態のクリア、ドラッグ見回し、ポインタ固定が拒否された場合のフォールバックを確認しています。
