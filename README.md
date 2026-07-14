# 爆破解体シミュレーター

CGモデリングおよび演習 最終課題。Three.js + cannon-es による物理演算デモ。
GUI（lil-gui）で爆発の位置・爆風半径・威力を指定し、建造物風の構造物を爆破解体する。

## 使用技術
- Three.js（描画、パーティクル演出）
- cannon-es（剛体物理演算、爆風の力積計算）
- @tweenjs/tween.js（カメラ演出）
- lil-gui（爆破パラメータ操作UI）

## セットアップ

```bash
npm install
npm run dev      # 開発サーバー
npm run build    # dist/ に本番ビルドを出力
```

## GitHub Pagesへの公開

1. このリポジトリをGitHub上にpushする
2. Settings → Pages → Source を「GitHub Actions」にするか、`dist`の内容を`gh-pages`ブランチやリポジトリ直下にpushする
3. 公開URL: `https://<ユーザー名>.github.io/<リポジトリ名>/`

`vite.config.ts`で`base: './'`（相対パス）を指定しているため、サブディレクトリ配下でも配信可能。

## ライセンス表記

本プロジェクトは以下のMITライセンスのライブラリを使用しています。

- [three.js](https://github.com/mrdoob/three.js) - Copyright © mrdoob and three.js authors
- [cannon-es](https://github.com/pmndrs/cannon-es) - Copyright © cannon-es authors
- [@tweenjs/tween.js](https://github.com/tweenjs/tween.js) - Copyright © tween.js authors
- [lil-gui](https://github.com/georgealways/lil-gui) - Copyright © lil-gui authors

各ライブラリはMITライセンスの下で提供されています。
