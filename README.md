# 破壊魔法シミュレーター

CGモデリングおよび演習 最終課題。Three.js + cannon-es による物理演算デモ。
汎用の魔法使いキャラクターを操作し、直線ビーム／落下の柱／魔法の雨の3種類の魔法で
遺跡風の建造物・樹木を物理演算的に破壊できる。

## 操作方法
- WASD／矢印キー：移動
- マウス移動：狙う方向・上下角度を指定
- マウスクリック：魔法発射（狙った地点へ着弾）
- マウスドラッグ：カメラ視点回転
- GUIパネル：魔法の種類・威力・範囲半径の変更、建造物・木のリセット

## 使用技術
- Three.js（描画、キャラクター・建造物・パーティクル演出）
- cannon-es（剛体物理演算、建物・樹木・魔法弾の衝突と爆風の力積計算）
- @tweenjs/tween.js（魔法陣の展開・発光アニメーション）
- lil-gui（魔法の種類・威力・範囲半径の操作UI）

## セットアップ

```bash
npm install
npm run dev      # 開発サーバー
npm run build    # docs/ に本番ビルドを出力
```

## GitHub Pagesへの公開

1. このリポジトリをGitHub上にpushする
2. Settings → Pages → Source を「Deploy from a branch」にし、Branch を `main` / `docs` に設定する
3. 公開URL: `https://<ユーザー名>.github.io/<リポジトリ名>/`

`vite.config.ts`で`base: './'`（相対パス）・`build.outDir: 'docs'`を指定しているため、
`npm run build`の出力をそのままGitHub Pagesの配信元にできる。

## ライセンス表記

本プロジェクトは以下のMITライセンスのライブラリを使用しています。

- [three.js](https://github.com/mrdoob/three.js) - Copyright © mrdoob and three.js authors
- [cannon-es](https://github.com/pmndrs/cannon-es) - Copyright © cannon-es authors
- [@tweenjs/tween.js](https://github.com/tweenjs/tween.js) - Copyright © tween.js authors
- [lil-gui](https://github.com/georgealways/lil-gui) - Copyright © lil-gui authors

各ライブラリはMITライセンスの下で提供されています。
