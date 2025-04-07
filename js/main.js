// グローバル変数
let scene, camera, renderer;
let board;          // オセロ盤（グループ）
let boardBase = null; // 盤のベースメッシュ（衝突判定用）
let statusDisplay;  // ステータス表示
let boardCursor;    // 盤面カーソル
let difficultyMenu; // 難易度選択メニュー
let pieces = [];    // 駒のリスト
let boardState = []; // 8×8の盤状態（0:空, 1:黒, -1:白）
let currentPlayer = 1; // 1: 黒（プレイヤー）、-1: 白（CPU）
let isPlayerTurn = true;
let xrSession = null, xrReferenceSpace = null, xrHitTestSource = null;
let controllers = []; // コントローラー配列に変更
let gameStarted = false;
let difficultySelected = false;
let playerWins = 0, cpuWins = 0, draws = 0, moveCount = 0;
let difficultyLevel = 'medium'; // デフォルトは中級
let gameResultMenu; // ゲーム結果メニュー
let particles = []; // パーティクル効果用
let fireworks = []; // 花火効果用
let soundEnabled = true; // 音声有効フラグ
let listener; // 音声リスナー
let sounds = {}; // 音声オブジェクト格納用
let welcomeParticles = []; // お出迎えパーティクル用
let lastSelectTime = 0; // 最後にselectイベントが発生した時間を保持
let isProcessingMove = false; // 駒を置く処理中かどうかのフラグ

// 持ち駒ケース関連の変数
let playerPieceCase; // プレイヤーの持ち駒ケース
let cpuPieceCase;    // CPUの持ち駒ケース
let playerRemainingPieces = 32; // プレイヤー残り駒 (最大32個)
let cpuRemainingPieces = 32;    // CPU残り駒 (最大32個)
const MAX_PIECES = 32;          // プレイヤーとCPUそれぞれの最大駒数
let displayedPlayerPieces = []; // 表示中のプレイヤー持ち駒
let displayedCpuPieces = [];    // 表示中のCPU持ち駒

// グリップ操作用変数
let isGripping = [false, false]; // 両方のコントローラーの状態を保持
let controllerInitialPositions = [new THREE.Vector3(), new THREE.Vector3()];
let boardInitialPosition = new THREE.Vector3();

// ひっくり返るアニメーション情報を保持するための変数
let flippingPieces = []; // アニメーション中の駒を管理する配列
let droppingPieces = []; // 駒を落とすアニメーション用の配列を追加

// 駒のフリップアニメーション関連の定数
const FLIP_RISE_HEIGHT = 0.08; // 駒が浮き上がる高さを増加（より目立つように）
const FLIP_DURATION = 45; // アニメーション全体の長さを延長（より滑らか）
const FLIP_RISE_TIME = 15; // 上昇に要するフレーム数を増加
const FLIP_FALL_TIME = 15; // 下降に要するフレーム数を増加
const FLIP_ROTATE_TIME = 15; // 回転に要するフレーム数を増加（より滑らか）
const DELTA_MULTIPLIER = 1.5; // フレームレート調整のための乗数

// -------------------------------
// 有効手のマーカーを管理する配列
// -------------------------------
let validMoveMarkers = [];

// -------------------------------
// 有効手のマーカーを作成する関数
// -------------------------------
function createValidMoveMarker(row, col) {
  const markerGroup = new THREE.Group();
  
  // シンプルな円形のマーカー
  const circleGeometry = new THREE.CircleGeometry(0.02, 16);
  const circleMaterial = new THREE.MeshBasicMaterial({
    color: 0x00ff00,
    transparent: true,
    opacity: 0.0, // 最初は透明
    side: THREE.DoubleSide,
    depthWrite: false
  });
  const circle = new THREE.Mesh(circleGeometry, circleMaterial);
  circle.rotation.x = -Math.PI / 2;
  circle.renderOrder = 60;
  markerGroup.add(circle);
  
  // セル中央に配置
  const boardX = -0.25 + 0.03125 + (col * 0.0625);
  const boardZ = -0.25 + 0.03125 + (row * 0.0625);
  markerGroup.position.set(boardX, 0.035, boardZ);
  
  // アニメーション用のデータ
  markerGroup.userData = {
    animationPhase: 0,
    fadeInDone: false,
    maxOpacity: 0.4,
    minOpacity: 0.15
  };
  
  return markerGroup;
}

// -------------------------------
// 有効手マーカーを表示・更新する関数
// -------------------------------
function showValidMoves(player) {
  // 既存のマーカーをクリア
  clearValidMoveMarkers();
  
  // プレイヤーターンでない場合はマーカーを表示しない
  if (!isPlayerTurn) return;
  
  // 全セルをチェックして有効手にマーカーを表示
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      if (isValidMove(row, col, player)) {
        const marker = createValidMoveMarker(row, col);
        board.add(marker);
        validMoveMarkers.push(marker);
      }
    }
  }
}

// -------------------------------
// 有効手マーカーをクリアする関数
// -------------------------------
function clearValidMoveMarkers() {
  for (const marker of validMoveMarkers) {
    board.remove(marker);
  }
  validMoveMarkers = [];
}

// -------------------------------
// 有効手マーカーのアニメーション更新関数
// -------------------------------
function updateValidMoveMarkers(deltaTime) {
  for (const marker of validMoveMarkers) {
    if (marker.userData) {
      // 位相を更新（非常にゆっくり）
      marker.userData.animationPhase += deltaTime * 0.8;
      
      const circle = marker.children[0];
      if (circle && circle.material) {
        if (!marker.userData.fadeInDone) {
          // フェードイン効果（じわっと点灯）
          circle.material.opacity += deltaTime * 0.05; // 非常にゆっくりフェードイン
          
          if (circle.material.opacity >= marker.userData.maxOpacity) {
            // フェードイン完了
            circle.material.opacity = marker.userData.maxOpacity;
            marker.userData.fadeInDone = true;
          }
        } else {
          // ゆっくり点滅（サイン波で緩やかに）
          const opacityRange = marker.userData.maxOpacity - marker.userData.minOpacity;
          const pulseValue = Math.sin(marker.userData.animationPhase * 0.1) * 0.5 + 0.5;
          circle.material.opacity = marker.userData.minOpacity + pulseValue * opacityRange;
        }
      }
    }
  }
}

// -------------------------------
// 効果音の初期化（WebAudio APIで生成）
// -------------------------------
function initSounds() {
  // オーディオリスナーの作成
  listener = new THREE.AudioListener();
  camera.add(listener);
  
  // 各種効果音を生成
  createSimpleSound('placePlayer', 0.5, 'playerPlace'); // プレイヤーが駒を置く音
  createSimpleSound('placeCPU', 0.5, 'cpuPlace');    // CPUが駒を置く音
  createSimpleSound('start', 0.7, 'startup');        // ゲーム開始音
  createSimpleSound('win', 0.7, 'fanfare');          // 勝利音
  createSimpleSound('lose', 0.5, 'low');             // 敗北音
  createSimpleSound('flip', 0.45, 'click');          // 駒がひっくり返る音（音量を0.3から0.45に上げる）
  createSimpleSound('select', 0.4, 'click');         // メニュー選択音
}




// 効果音の再生（バリエーション付き）
function playSound(name) {
  if (!soundEnabled || !sounds[name]) return;
  
  // 現在再生中なら一度停止
  if (sounds[name].isPlaying) {
    sounds[name].stop();
  }
  
  // すべての効果音は固定ピッチで再生
  sounds[name].setPlaybackRate(1.0);
  
  // 再生
  sounds[name].play();
}

// WebAudio APIで効果音を生成する関数（バリエーション追加版）
function createSimpleSound(name, volume = 0.5, type = 'default', loop = false) {
  const sound = new THREE.Audio(listener);
  sounds[name] = sound;
  sound.setVolume(volume);
  sound.setLoop(loop);
  
  // オーディオコンテキスト
  const context = listener.context;
  const sampleRate = context.sampleRate;
  
  // 音の長さ（秒）
  let duration = 0.3;
  if (type === 'startup') duration = 1.0;
  if (type === 'fanfare') duration = 2.0;
  if (type === 'ambient') duration = 4.0;
  
  // バッファを作成
  const bufferSize = sampleRate * duration;
  const buffer = context.createBuffer(1, bufferSize, sampleRate);
  const data = buffer.getChannelData(0);
  
  // 波形生成
  for (let i = 0; i < bufferSize; i++) {
    const t = i / sampleRate; // 時間（秒）
    let val = 0;
    
    if (type === 'playerPlace') {
      // プレイヤーの駒を置く音（明るめの音）
      const freq = 600;
      const decay = 15;
      val = Math.sin(2 * Math.PI * freq * t);
      val += 0.3 * Math.sin(2 * Math.PI * freq * 1.5 * t); // 明るい倍音
      val *= Math.exp(-decay * t);
    } else if (type === 'cpuPlace') {
      // CPUの駒を置く音（低めの音）
      const freq = 400;
      const decay = 15;
      val = Math.sin(2 * Math.PI * freq * t);
      val += 0.2 * Math.sin(2 * Math.PI * freq * 2 * t); // 倍音
      val *= Math.exp(-decay * t);
    } else if (type === 'click') {
      // 使い分け：flip用とselect用で異なる音を生成
      if (name === 'flip') {
        // 駒をひっくり返す音（木製の質感）
        const woodFreq = 800;
        
        // 木製の音
        val = Math.sin(2 * Math.PI * woodFreq * t);
        val += 0.4 * Math.sin(2 * Math.PI * woodFreq * 1.5 * t);
        
        // カチッという音
        if (t > 0.05 && t < 0.15) {
          const tapSound = Math.sin(2 * Math.PI * 1200 * (t - 0.05));
          val += 0.35 * tapSound * Math.exp(-30 * (t - 0.05));
        }
        
        val *= Math.exp(-20 * t);
      } else if (name === 'select') {
        // メニュー選択音（短くて明るい音）
        const freq = 880; // 高い音に変更（660から880へ）
        val = Math.sin(2 * Math.PI * freq * t);
        val += 0.3 * Math.sin(2 * Math.PI * freq * 2 * t); // より明るい倍音を追加
        val *= Math.exp(-40 * t); // より短い減衰
      }
    } else if (type === 'startup') {
      // 起動音（上昇する音）
      const freq1 = 300 + 700 * t;
      const freq2 = 600;
      val = 0.5 * Math.sin(2 * Math.PI * freq1 * t) + 0.5 * Math.sin(2 * Math.PI * freq2 * t);
      val *= Math.pow(t / duration, 0.2) * Math.exp(-4 * t / duration);
    } else if (type === 'fanfare') {
      // 勝利音（ファンファーレ）
      const phase = t / duration;
      if (phase < 0.2) {
        // 最初の音
        val = Math.sin(2 * Math.PI * 440 * t);
      } else if (phase < 0.4) {
        // 2つ目の音
        val = Math.sin(2 * Math.PI * 554 * t);
      } else if (phase < 0.6) {
        // 3つ目の音
        val = Math.sin(2 * Math.PI * 659 * t);
      } else {
        // フィナーレ
        val = 0.4 * Math.sin(2 * Math.PI * 440 * t) + 
              0.3 * Math.sin(2 * Math.PI * 554 * t) + 
              0.3 * Math.sin(2 * Math.PI * 659 * t);
      }
      val *= 0.7;
      val *= Math.exp(-2 * (t - phase * duration) / (duration * 0.2));
    } else if (type === 'low') {
      // 敗北音（低く沈む音）
      const freqStart = 300;
      const freqEnd = 100;
      const freq = freqStart - (freqStart - freqEnd) * (t / duration);
      val = Math.sin(2 * Math.PI * freq * t);
      val += 0.2 * Math.sin(2 * Math.PI * freq * 0.5 * t); // サブ低音
      val *= Math.exp(-3 * t / duration);
    } else {
      // デフォルト音
      const freq = 500;
      val = Math.sin(2 * Math.PI * freq * t);
      val *= Math.exp(-10 * t / duration);
    }
    
    data[i] = val;
  }
  
  sound.setBuffer(buffer);
}




// -------------------------------
// 3Dテキスト生成（高品質・立体的）
// -------------------------------
function createTextureText(text, size = 0.1, color = "#ffffff") {
  // キャンバスサイズを大きく
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 256;
  const context = canvas.getContext('2d');
  
  // 背景を透明に
  context.clearRect(0, 0, canvas.width, canvas.height);
  
  // フォント設定
  const fontSize = 72;
  context.font = `bold ${fontSize}px sans-serif, "ヒラギノ角ゴ Pro W3", "Hiragino Kaku Gothic Pro", Osaka, "メイリオ", Meiryo, "MS Pゴシック", "MS PGothic"`;
  
  // テキストの描画位置を計算
  let textX = canvas.width / 2;
  let textY = canvas.height / 2;
  
  // 改行があるかチェック
  if (text.includes('\n')) {
    const lines = text.split('\n');
    const lineHeight = fontSize * 1.2;
    const totalHeight = lines.length * lineHeight;
    textY = (canvas.height - totalHeight) / 2 + fontSize / 2;
    
    // 複数行のテキストを描画
    lines.forEach((line, index) => {
      const y = textY + index * lineHeight;
      // 光沢効果のためのグラデーション
      const gradient = context.createLinearGradient(textX - 100, y - fontSize/2, textX + 100, y + fontSize/2);
      gradient.addColorStop(0, '#ffffff');
      gradient.addColorStop(0.5, color);
      gradient.addColorStop(1, '#ffffff');
      
      // テキストの影を描画
      context.shadowColor = 'rgba(0, 0, 0, 0.5)';
      context.shadowBlur = 10;
      context.shadowOffsetX = 2;
      context.shadowOffsetY = 2;
      context.fillStyle = gradient;
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      context.fillText(line, textX, y, canvas.width - 20);
      
      // 装飾的な枠を描画
      context.strokeStyle = 'rgba(255, 255, 255, 0.3)';
      context.lineWidth = 2;
      context.strokeText(line, textX, y, canvas.width - 20);
    });
  } else {
    // 単一行のテキスト
    // 光沢効果のためのグラデーション
    const gradient = context.createLinearGradient(textX - 100, textY - fontSize/2, textX + 100, textY + fontSize/2);
    gradient.addColorStop(0, '#ffffff');
    gradient.addColorStop(0.5, color);
    gradient.addColorStop(1, '#ffffff');
    
    // テキストの影を描画
    context.shadowColor = 'rgba(0, 0, 0, 0.5)';
    context.shadowBlur = 10;
    context.shadowOffsetX = 2;
    context.shadowOffsetY = 2;
    context.fillStyle = gradient;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(text, textX, textY, canvas.width - 20);
    
    // 装飾的な枠を描画
    context.strokeStyle = 'rgba(255, 255, 255, 0.3)';
    context.lineWidth = 2;
    context.strokeText(text, textX, textY, canvas.width - 20);
  }
  
  // テクスチャ作成
  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.format = THREE.RGBAFormat;
  texture.type = THREE.UnsignedByteType;
  texture.colorSpace = THREE.SRGBColorSpace; // カラースペースをsRGBに設定
  
  // 発光効果のあるマテリアル
  const material = new THREE.MeshBasicMaterial({
    map: texture,
    transparent: true,
    side: THREE.DoubleSide,
    depthWrite: false,
    depthTest: false,
    toneMapped: false // トーンマッピングを無効化
  });
  
  // テクスチャを貼り付けた平面
  const geometry = new THREE.PlaneGeometry(size, size * (canvas.height / canvas.width));
  const mesh = new THREE.Mesh(geometry, material);
  
  return mesh;
}


// -------------------------------
// 難易度選択メニューの作成
// -------------------------------
function createDifficultyMenu() {
  const menuGroup = new THREE.Group();
  menuGroup.renderOrder = 100; // 最も前面に表示
  
  // メニューパネル背景
  const panelGeometry = new THREE.BoxGeometry(0.6, 0.5, 0.02);
  const panelMaterial = new THREE.MeshPhongMaterial({
    color: 0x1a2a4a,
    transparent: true,
    opacity: 0, // 最初は完全に透明
    shininess: 100,
    depthWrite: true, // 深度書き込みを有効化
  });
  const panel = new THREE.Mesh(panelGeometry, panelMaterial);
  panel.renderOrder = 100; // 最も前面に表示
  menuGroup.add(panel);
  
  // 光沢のある枠
  const frameGeometry = new THREE.BoxGeometry(0.62, 0.52, 0.01);
  const frameMaterial = new THREE.MeshPhongMaterial({
    color: 0x4b6cb7,
    transparent: true,
    opacity: 0, // 最初は完全に透明
    shininess: 120,
    depthWrite: true, // 深度書き込みを有効化
  });
  const frame = new THREE.Mesh(frameGeometry, frameMaterial);
  frame.position.z = -0.01;
  frame.renderOrder = 100; // 最も前面に表示
  menuGroup.add(frame);
  
  // タイトルテキスト
  const titleGroup = new THREE.Group();
  titleGroup.position.set(0, 0.18, 0.02);
  titleGroup.renderOrder = 101; // メニューより前面に表示

  const titleText = createTextureText('難易度選択', 0.25);
  titleText.renderOrder = 101; // メニューより前面に表示
  titleText.material.opacity = 0; // 最初は完全に透明
  titleText.material.transparent = true;
  titleGroup.add(titleText);
  menuGroup.add(titleGroup);
  
  // 難易度ボタン
  const buttonY = [0.05, -0.05, -0.15];
  const buttonLabels = ['初級', '中級', '上級'];
  const buttonValues = ['easy', 'medium', 'hard'];
  const buttonColors = [0x4caf50, 0x2196f3, 0xf44336];
  const buttons = [];
  
  for (let i = 0; i < 3; i++) {
    const buttonGroup = new THREE.Group();
    buttonGroup.position.set(0, buttonY[i], 0.02);
    buttonGroup.renderOrder = 101; // メニューより前面に表示
    
    // ボタン背景
    const buttonGeometry = new THREE.BoxGeometry(0.35, 0.08, 0.02);
    const buttonMaterial = new THREE.MeshPhongMaterial({
      color: buttonColors[i],
      transparent: true,
      opacity: 0, // 最初は完全に透明
      shininess: 100,
      depthWrite: true, // 深度書き込みを有効化
    });
    const buttonMesh = new THREE.Mesh(buttonGeometry, buttonMaterial);
    buttonMesh.renderOrder = 101; // メニューより前面に表示
    buttonGroup.add(buttonMesh);
    
    // ボタンテキスト
    const textMesh = createTextureText(buttonLabels[i], 0.2);
    textMesh.position.set(0, 0, 0.02);
    textMesh.renderOrder = 102; // ボタンより前面に表示
    textMesh.material.opacity = 0; // 最初は完全に透明
    textMesh.material.transparent = true;
    buttonGroup.add(textMesh);
    
    // ボタンのユーザーデータを設定
    buttonGroup.userData = {
      type: 'difficultyButton',
      value: buttonValues[i],
      originalColor: buttonColors[i]
    };
    
    buttons.push(buttonGroup);
    menuGroup.add(buttonGroup);
  }
  
  // スタートボタン
  const startButtonGroup = new THREE.Group();
  startButtonGroup.position.set(0, -0.35, 0.02);
  startButtonGroup.renderOrder = 101; // メニューより前面に表示
  
  const startBtnGeometry = new THREE.BoxGeometry(0.4, 0.08, 0.02);
  const startBtnMaterial = new THREE.MeshPhongMaterial({
    color: 0x4b6cb7,
    transparent: true,
    opacity: 0, // 最初は完全に透明
    shininess: 100,
    depthWrite: true, // 深度書き込みを有効化
  });
  const startBtnMesh = new THREE.Mesh(startBtnGeometry, startBtnMaterial);
  startBtnMesh.renderOrder = 101; // メニューより前面に表示
  startButtonGroup.add(startBtnMesh);
  
  const startTextMesh = createTextureText('ゲーム開始', 0.22);
  startTextMesh.position.set(0, 0, 0.02);
  startTextMesh.renderOrder = 102; // ボタンより前面に表示
  startTextMesh.material.opacity = 0; // 最初は完全に透明
  startTextMesh.material.transparent = true;
  startButtonGroup.add(startTextMesh);
  
  startButtonGroup.userData = {
    type: 'startButton',
    originalColor: 0x4b6cb7
  };
  
  menuGroup.add(startButtonGroup);
  
  // フェードイン用のユーザーデータを追加
  menuGroup.userData = {
    fadeIn: true,
    fadeProgress: 0,
    fadeSpeed: 0.008, // 0.02から0.008に変更してより遅くする
    faceCamera: true
  };
  
  // 最初は初級が選択されているようにハイライト
  highlightButton(buttons[0]); // 中級(buttons[1])から初級(buttons[0])に変更
  
  return menuGroup;
}

// ボタンのハイライト/選択表示
function highlightButton(buttonGroup) {
  // difficultyMenuが存在する場合のみtraverseを実行
  if (difficultyMenu) {
    difficultyMenu.traverse((child) => {
      if (child.userData && child.userData.type === 'difficultyButton') {
        if (child.children && child.children.length > 0) {
          child.children[0].material.color.setHex(child.userData.originalColor);
          if (child.children[0].material.emissive) {
            child.children[0].material.emissive.set(0x000000);
          }
          
          // 選択されていないボタンは通常の明るさに
          if (child.children[0].material) {
            child.children[0].material.shininess = 100;
          }
        }
      }
    });
  }
      
  // 選択されたボタンをハイライト
  if (buttonGroup && buttonGroup.userData && buttonGroup.userData.type === 'difficultyButton') {
    if (buttonGroup.children && buttonGroup.children.length > 0) {
      // 発光効果を強化
      if (buttonGroup.children[0].material.emissive) {
        buttonGroup.children[0].material.emissive.set(0x555555); // より強い発光に設定（0x333333から0x555555）
      }
      
      // 光沢を増加させてより目立たせる
      if (buttonGroup.children[0].material) {
        buttonGroup.children[0].material.shininess = 200; // 光沢を強くする（100から200に）
        // ボタンをやや明るく
        buttonGroup.children[0].material.color.multiplyScalar(1.3);
      }
      
      // 難易度を更新
      difficultyLevel = buttonGroup.userData.value;
      playSound('select');
    }
  }
}

// -------------------------------
// ゲーム結果メニュー
// -------------------------------
function createGameResultMenu(isWin) {
  const menuGroup = new THREE.Group();
  menuGroup.renderOrder = 100; // 最も前面に表示
  
  // メニューパネル背景（難易度選択メニューと同じデザイン）- 縦サイズを大きくする
  const panelGeometry = new THREE.BoxGeometry(0.6, 0.55, 0.02); // 0.5から0.55に高さを拡大
  const panelMaterial = new THREE.MeshPhongMaterial({
    color: 0x1a2a4a, // 背景色を統一
    transparent: true,
    opacity: 0.9,
    shininess: 100,
    depthWrite: true, // 深度書き込みを有効化
  });
  const panel = new THREE.Mesh(panelGeometry, panelMaterial);
  panel.renderOrder = 100; // 最も前面に表示
  menuGroup.add(panel);
  
  // 光沢のある枠（勝敗に応じて色が変わる）- こちらも縦サイズを大きくする
  const frameGeometry = new THREE.BoxGeometry(0.62, 0.57, 0.01); // 0.52から0.57に高さを拡大
  const frameMaterial = new THREE.MeshPhongMaterial({
    color: isWin ? 0x4caf50 : 0xf44336,
    transparent: true,
    opacity: 0.8,
    shininess: 120,
    depthWrite: true, // 深度書き込みを有効化
  });
  const frame = new THREE.Mesh(frameGeometry, frameMaterial);
  frame.position.z = -0.01;
  frame.renderOrder = 100; // 最も前面に表示
  menuGroup.add(frame);
  
  // 結果テキスト - 位置を少し上に移動
  const titleGroup = new THREE.Group();
  titleGroup.position.set(0, 0.2, 0.02); // 0.18から0.2に上に移動
  titleGroup.renderOrder = 101; // メニューより前面に表示
  
  const titleText = createTextureText(isWin ? 'あなたの勝ち！' : 'あなたの負け', 0.25, "#ffffff");
  titleText.renderOrder = 101; // メニューより前面に表示
  titleGroup.add(titleText);
  menuGroup.add(titleGroup);
  
  // スコア表示
  const scoreGroup = new THREE.Group();
  scoreGroup.position.set(0, 0.07, 0.02); // 0.05から0.07に上に移動
  scoreGroup.renderOrder = 101; // メニューより前面に表示
  
  const scoreText = createTextureText(`プレイヤー: ${playerWins}勝 CPU: ${cpuWins}勝`, 0.2, "#ffffff");
  scoreText.renderOrder = 101; // メニューより前面に表示
  scoreGroup.add(scoreText);
  menuGroup.add(scoreGroup);
  
  // 再戦・難易度選択ボタン - 位置を調整
  const buttonGroup = new THREE.Group();
  buttonGroup.position.set(0, -0.08, 0.02); // -0.1から-0.08に少し上に移動
  buttonGroup.renderOrder = 101; // メニューより前面に表示
  
  const buttonGeometry = new THREE.BoxGeometry(0.4, 0.08, 0.02);
  const buttonMaterial = new THREE.MeshPhongMaterial({
    color: 0x2196f3,
    transparent: true,
    opacity: 0.9,
    shininess: 100,
    depthWrite: true, // 深度書き込みを有効化
  });
  const buttonMesh = new THREE.Mesh(buttonGeometry, buttonMaterial);
  buttonMesh.renderOrder = 101; // メニューより前面に表示
  buttonGroup.add(buttonMesh);
  
  const buttonText = createTextureText('難易度選択に戻る', 0.2, "#ffffff");
  buttonText.position.set(0, 0, 0.02);
  buttonText.renderOrder = 102; // ボタンより前面に表示
  buttonGroup.add(buttonText);
  
  buttonGroup.userData = {
    type: 'difficultyMenuButton',
    originalColor: 0x2196f3
  };
  
  menuGroup.add(buttonGroup);
  
  // 再戦ボタン（同じ難易度で）- 位置を調整
  const rematchGroup = new THREE.Group();
  rematchGroup.position.set(0, -0.22, 0.02); // -0.25から-0.22に少し上に移動
  rematchGroup.renderOrder = 101; // メニューより前面に表示
  
  const rematchGeometry = new THREE.BoxGeometry(0.4, 0.08, 0.02);
  const rematchMaterial = new THREE.MeshPhongMaterial({
    color: 0x4b6cb7,
    transparent: true,
    opacity: 0.9,
    shininess: 100,
    depthWrite: true, // 深度書き込みを有効化
  });
  const rematchMesh = new THREE.Mesh(rematchGeometry, rematchMaterial);
  rematchMesh.renderOrder = 101; // メニューより前面に表示
  rematchGroup.add(rematchMesh);
  
  const rematchText = createTextureText('同じ難易度で再戦', 0.2, "#ffffff");
  rematchText.position.set(0, 0, 0.02);
  rematchText.renderOrder = 102; // ボタンより前面に表示
  rematchGroup.add(rematchText);
  
  rematchGroup.userData = {
    type: 'rematchButton',
    originalColor: 0x4b6cb7,
    playerWon: isWin
  };
  
  menuGroup.add(rematchGroup);
  
  return menuGroup;
}

// -------------------------------
// 3Dステータス表示の作成（高級感・視認性向上）
// -------------------------------
function createStatusDisplay() {
  const displayGroup = new THREE.Group();
  displayGroup.renderOrder = 50; // 通常のオブジェクトより前、メニューより後ろ
  
  // メインパネル（高級感のあるデザイン）
  const panelGeometry = new THREE.BoxGeometry(0.6, 0.2, 0.02);
  const panelMaterial = new THREE.MeshPhongMaterial({
    color: 0x0a0a1a,
    transparent: true,
    opacity: 0.95,
    shininess: 200,
    emissive: 0x000000,
    emissiveIntensity: 0.1,
    depthWrite: true // 深度書き込みを有効化
  });
  const panel = new THREE.Mesh(panelGeometry, panelMaterial);
  panel.renderOrder = 50;
  displayGroup.add(panel);
  
  // 透明なワッカ（回転アニメーション用）
  const ringGeometry = new THREE.TorusGeometry(0.35, 0.005, 16, 100);
  const ringMaterial = new THREE.MeshPhongMaterial({
    color: 0x4b6cb7,
    transparent: true,
    opacity: 0.5,
    shininess: 100,
    emissive: 0x4b6cb7,
    emissiveIntensity: 0.2,
    map: createRingTexture(),
    depthWrite: false // 深度書き込みをオフに
  });
  const ring = new THREE.Mesh(ringGeometry, ringMaterial);
  ring.rotation.x = Math.PI / 2;
  ring.renderOrder = 51;
  displayGroup.add(ring);
  
  // 内側の装飾的な枠（角丸）
  const innerFrameGeometry = new THREE.BoxGeometry(0.58, 0.18, 0.01);
  const innerFrameMaterial = new THREE.MeshPhongMaterial({
    color: 0x1a2a4a,
    transparent: true,
    opacity: 0.8,
    shininess: 150,
    depthWrite: true // 深度書き込みを有効化
  });
  const innerFrame = new THREE.Mesh(innerFrameGeometry, innerFrameMaterial);
  innerFrame.position.z = 0.01;
  innerFrame.renderOrder = 52;
  displayGroup.add(innerFrame);
  
  // 情報テキスト表示用のグループ
  const textGroups = [];
  const textLabels = ['ターン: 0', 'プレイヤー: 0勝', 'CPU: 0勝', ' '];
  const textPositions = [
    new THREE.Vector3(0, 0.05, 0.02),  // ターン表示
    new THREE.Vector3(-0.2, 0, 0.02), // プレイヤー勝利数
    new THREE.Vector3(0.2, 0, 0.02),  // CPU勝利数
    new THREE.Vector3(0, -0.05, 0.02)     // メッセージ表示
  ];
  const textIds = ['turnText', 'playerText', 'cpuText', 'messageText'];
  
  for (let i = 0; i < textLabels.length; i++) {
    const textGroup = new THREE.Group();
    textGroup.position.copy(textPositions[i]);
    textGroup.renderOrder = 53; // テキストを一番前に表示
    
    // テキストのサイズと色を調整
    const size = i === 0 ? 0.15 : i === 3 ? 0.18 : 0.12;
    const color = i === 0 ? '#4b6cb7' : '#ffffff';
    
    const textMesh = createTextureText(textLabels[i], size, color);
    textMesh.renderOrder = 53; // テキストを一番前に表示
    textGroup.add(textMesh);
    textGroup.userData = { 
      type: 'statusText', 
      id: textIds[i]
    };
    
    textGroups.push(textGroup);
    displayGroup.add(textGroup);
  }
  
  // アニメーション用のユーザーデータを追加
  displayGroup.userData = {
    ringRotation: 0,
    glowIntensity: 0,
    glowDirection: 1
  };
  
  return displayGroup;
}

// ステータステキストの更新
function updateStatusText(id, newText) {
  if (!statusDisplay) return;
  
  statusDisplay.traverse((child) => {
    if (child.userData && child.userData.type === 'statusText' && child.userData.id === id) {
      // 既存のテキストメッシュをすべて削除
      while (child.children.length > 0) {
        const mesh = child.children[0];
        child.remove(mesh);
        if (mesh.geometry) mesh.geometry.dispose();
        if (mesh.material) {
          if (Array.isArray(mesh.material)) {
            mesh.material.forEach(mat => mat.dispose());
          } else {
            mesh.material.dispose();
          }
        }
      }
      
      // 新しいテキストを作成
      const size = id === 'turnText' ? 0.15 : id === 'messageText' ? 0.18 : 0.12;
      const color = id === 'turnText' ? '#4b6cb7' : '#ffffff';
      const textMesh = createTextureText(newText, size, color);
      textMesh.renderOrder = 53; // テキストを一番前に表示
      
      child.add(textMesh);
    }
  });
}

// リングのテクスチャ生成
function createRingTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  
  // グラデーションの作成
  const gradient = ctx.createLinearGradient(0, 0, canvas.width, 0);
  gradient.addColorStop(0, 'rgba(75, 108, 183, 0.8)');   // 青
  gradient.addColorStop(0.3, 'rgba(75, 108, 183, 0.2)'); // 薄い青
  gradient.addColorStop(0.5, 'rgba(75, 108, 183, 0.8)'); // 青
  gradient.addColorStop(0.7, 'rgba(75, 108, 183, 0.2)'); // 薄い青
  gradient.addColorStop(1, 'rgba(75, 108, 183, 0.8)');   // 青
  
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  
  // ノイズを追加
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;
  
  for (let i = 0; i < data.length; i += 4) {
    const noise = Math.random() * 0.2;
    data[i] = data[i] * (1 + noise);
    data[i + 1] = data[i + 1] * (1 + noise);
    data[i + 2] = data[i + 2] * (1 + noise);
  }
  
  ctx.putImageData(imageData, 0, 0);
  
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.repeat.x = 2;
  return texture;
}

// レンダリングループ内のステータス表示のアニメーション更新
function updateStatusDisplay(deltaTime) {
  if (!statusDisplay) return;
  
  const userData = statusDisplay.userData;
  
  // ワッカの回転アニメーション（より遅く）
  userData.ringRotation += deltaTime * 0.02;
  statusDisplay.children[1].rotation.z = userData.ringRotation;
  
  // 光る効果のアニメーション
  userData.glowIntensity += deltaTime * 0.1 * userData.glowDirection;
  if (userData.glowIntensity >= 0.2) {
    userData.glowDirection = -1;
  } else if (userData.glowIntensity <= 0) {
    userData.glowDirection = 1;
  }
  
  statusDisplay.children[1].material.emissiveIntensity = userData.glowIntensity;
}

function updateGameMessage(newMessage) {
  updateStatusText('messageText', newMessage);
}

function updateStatus() {
  updateStatusText('turnText', `ターン: ${moveCount}`);
  updateStatusText('playerText', `プレイヤー: ${playerWins}勝`);
  updateStatusText('cpuText', `CPU: ${cpuWins}勝`);
}

// -------------------------------
// 盤状態の初期化
// -------------------------------
function initBoard() {
  boardState = Array(8).fill().map(() => Array(8).fill(0));
  boardState[3][3] = -1;
  boardState[3][4] = 1;
  boardState[4][3] = 1;
  boardState[4][4] = -1;
  
  // 持ち駒数を最大値にリセット
  // 持ち駒とは盤面にまだ置いていない駒のこと
  playerRemainingPieces = MAX_PIECES;
  cpuRemainingPieces = MAX_PIECES;
}

// VR機器検出メッセージを更新する関数
function updateDeviceMessage(message, isDetected = false) {
  const deviceMessage = document.getElementById('device-message');
  if (deviceMessage) {
    deviceMessage.textContent = message;
    if (isDetected) {
      deviceMessage.style.color = '#4eff9f'; // 検出成功時は緑色に
      document.querySelector('.device-status .icon').textContent = ''; // 矢印を削除
    }
  }
}

// MRモード開始前にVR機器のサポート状況をチェック
function checkVRSupport() {
  if (navigator.xr) {
    navigator.xr.isSessionSupported('immersive-ar')
      .then(supported => {
        if (supported) {
          updateDeviceMessage('VR機器を検出しました！準備完了', true);
        } else {
          updateDeviceMessage('お使いの機器ではVRがサポートされていません');
        }
      })
      .catch(err => {
        updateDeviceMessage('VR機器の検出中にエラーが発生しました');
        console.error('VR検出エラー:', err);
      });
  } else {
    updateDeviceMessage('お使いのブラウザはWebXRをサポートしていません');
  }
}

// -------------------------------
// XRセッションの開始
// -------------------------------
async function startXRSession() {
  if (!navigator.xr) {
    alert('WebXRはお使いのブラウザでサポートされていません。');
    return;
  }
  
  try {
    // ローディング画面を表示
    const loadingUI = document.getElementById('loadingUI');
    if (loadingUI) {
      loadingUI.style.display = 'flex';
    }
    
    const supported = await navigator.xr.isSessionSupported('immersive-ar');
    if (!supported) {
      if (loadingUI) loadingUI.style.display = 'none';
      alert('イマーシブARセッションはお使いのデバイスでサポートされていません。');
      return;
    }
    
    // メニューUIを非表示
    document.getElementById('menuUI').style.display = 'none';
    
    xrSession = await navigator.xr.requestSession('immersive-ar', {
      requiredFeatures: ['hit-test', 'local-floor'],
      optionalFeatures: ['dom-overlay'],
      domOverlay: { root: document.body }
    });
    
    xrSession.addEventListener('end', () => {
      xrSession = null;
      document.getElementById('menuUI').style.display = 'flex';
      if (loadingUI) loadingUI.style.display = 'none';
    });
    
    renderer.xr.enabled = true;
    renderer.xr.setReferenceSpaceType('local-floor');
    renderer.xr.setSession(xrSession);

    // コントローラー設定
    controllers = [
      renderer.xr.getController(0),
      renderer.xr.getController(1)
    ];
    
    controllers.forEach((controller, index) => {
      controller.addEventListener('select', onSelect);
      controller.addEventListener('squeezestart', onSqueezeStart);
      controller.addEventListener('squeezeend', onSqueezeEnd);
      
      // レイ（光沢のある青いライン）の追加
      const rayGeom = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(0, 0, -1)
      ]);
      const rayLine = new THREE.Line(
        rayGeom, 
        new THREE.LineBasicMaterial({ 
          color: 0x4b6cb7, 
          linewidth: 2,
          transparent: true,
          opacity: 0.7
        })
      );
      rayLine.name = 'controller-line';
      rayLine.scale.z = 5;
      controller.add(rayLine);
      scene.add(controller);
    });

    xrReferenceSpace = await xrSession.requestReferenceSpace('local-floor');
    const viewerSpace = await xrSession.requestReferenceSpace('viewer');
    xrHitTestSource = await xrSession.requestHitTestSource({ space: viewerSpace });

    renderer.setAnimationLoop(renderFrame);
    
    // 音声の初期化
    initSounds();
    
    // BGMを再生するコード
    const audioLoader = new THREE.AudioLoader();
    const bgm = new THREE.Audio(listener);
    audioLoader.load('assets/sounds/osero.mp3', function(buffer) {
      bgm.setBuffer(buffer);
      bgm.setLoop(true);
      bgm.setVolume(0.2); // 音量を0.3から0.2に下げる
      bgm.play();
    });
    
    // ローディング画面を非表示
    setTimeout(() => {
      if (loadingUI) loadingUI.style.display = 'none';
      
      // MRモードになったら難易度選択メニュー表示
      placeInitialEnvironment();
    }, 1500); // 少し遅延して表示
    
  } catch (error) {
    // エラー時にはローディング画面を非表示に
    const loadingUI = document.getElementById('loadingUI');
    if (loadingUI) loadingUI.style.display = 'none';
    
    console.error('XRセッション開始中にエラー:', error);
    alert('XRセッション開始中にエラーが発生しました: ' + error.message);
  }
}

// -------------------------------
// 初期環境配置
// -------------------------------
function placeInitialEnvironment() {
  // 難易度選択メニューを作成して目の前に配置（位置調整）
  difficultyMenu = createDifficultyMenu();
  difficultyMenu.position.set(0, 1.3, -1.1); // Z座標を-1.3から-1.1に変更（より手前に）
  // ユーザーデータにfaceCamera=trueフラグを追加して、カメラの方向を常に向くように
  difficultyMenu.userData.faceCamera = true;
  scene.add(difficultyMenu);
  difficultySelected = false;
  
  // お出迎えパーティクルエフェクトを追加（これは残す）
  createWelcomeEffect();
  
  // 効果音
  playSound('start');
}

// -------------------------------
// お出迎えエフェクト
// -------------------------------
function createWelcomeEffect() {
  // 空間全体に漂うパーティクル
  for (let i = 0; i < 6; i++) { // 3個から6個に増加
    const particleSystem = createWelcomeParticles();
    
    // 最初は中央付近に配置
    particleSystem.position.set(
      (Math.random() - 0.5) * 0.5, // 範囲を狭く
      1.3 + (Math.random() - 0.5) * 0.3, // ほぼ視界中央の高さ
      -1.1 + (Math.random() - 0.5) * 0.5  // -1.3から-1.1に変更（より手前に）
    );
    
    scene.add(particleSystem);
    welcomeParticles.push(particleSystem);
    
    // 中央から外側に移動するベクトルを設定
    const moveDirection = new THREE.Vector3(
      (Math.random() - 0.5) * 2.5, // 横方向の拡散範囲
      (Math.random() - 0.5) * 1.2, // 縦方向の拡散範囲
      (Math.random() - 0.5) * 2.5  // 前後方向の拡散範囲
    ).normalize().multiplyScalar(0.025); // 速度
    
    particleSystem.userData.moveDirection = moveDirection;
    particleSystem.userData.initialPosition = particleSystem.position.clone();
    particleSystem.userData.expansionPhase = true; // 拡散フェーズフラグ
    particleSystem.userData.expansionTime = 0; // 拡散タイマー
    particleSystem.userData.maxExpansionTime = 50 + Math.random() * 30; // 拡散時間
    
    // 描画順序を制御するためのrenderOrder設定
    particleSystem.renderOrder = 1; // より低い値にして確実に背面に表示
  }
  
  // ゲーム開始時の星型パーティクルを直接作成して追加
  const starBurstParticleTexture = createStarParticleTexture();
  const starBurstGeometry = new THREE.BufferGeometry();
  const starParticleCount = 75; // 星の数
  
  const starPositions = new Float32Array(starParticleCount * 3);
  const starColors = new Float32Array(starParticleCount * 3);
  const starSizes = new Float32Array(starParticleCount);
  const starVelocities = [];
  
  // 星用のカラーパレット（金色と白色）
  const starColors1 = [
    new THREE.Color(0xffd700), // ゴールド
    new THREE.Color(0xffec85), // 淡いゴールド
    new THREE.Color(0xffffaa), // 非常に淡いゴールド
    new THREE.Color(0xffffff), // 白
  ];
  
  // 全方向に飛び散る星型パーティクル
  for (let i = 0; i < starParticleCount; i++) {
    const i3 = i * 3;
    
    // 中心からほぼ0の位置からスタート
    starPositions[i3] = (Math.random() - 0.5) * 0.1;
    starPositions[i3 + 1] = (Math.random() - 0.5) * 0.1;
    starPositions[i3 + 2] = (Math.random() - 0.5) * 0.1;
    
    // 色はランダムに金〜白
    const color = starColors1[Math.floor(Math.random() * starColors1.length)];
    starColors[i3] = color.r;
    starColors[i3 + 1] = color.g;
    starColors[i3 + 2] = color.b;
    
    // サイズもランダム（中くらい〜大きめ）
    starSizes[i] = Math.random() * 0.04 + 0.02;
    
    // 速度ベクトル（上向きを中心に広がる）
    const upwardBias = 0.75; // 上向きのバイアス
    const horizontalSpread = 0.35; // 横方向への広がり
    
    // 上方向の基本速度（星型は少し速く）- 速度を遅くする
    let baseY = Math.random() * 0.025 + 0.025; // 基本速度
    
    // 横方向（X, Z）の速度
    const angle = Math.random() * Math.PI * 2; // 水平方向のランダムな角度
    const horizontalSpeed = Math.random() * horizontalSpread * 0.05;
    const vx = Math.cos(angle) * horizontalSpeed;
    const vz = Math.sin(angle) * horizontalSpeed;
    
    // 上方向を維持しつつ、少しだけランダム性を加える
    const vy = baseY * (upwardBias + (1.0 - upwardBias) * Math.random());
    
    starVelocities.push({
      x: vx,
      y: vy,
      z: vz,
      gravity: Math.random() * 0.0003 + 0.0001, // 重力
      decay: Math.random() * 0.01 + 0.005 // 減衰率
    });
  }
  
  starBurstGeometry.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
  starBurstGeometry.setAttribute('color', new THREE.BufferAttribute(starColors, 3));
  starBurstGeometry.setAttribute('size', new THREE.BufferAttribute(starSizes, 1));
  
  // 星型パーティクル用マテリアル
  const starBurstMaterial = new THREE.PointsMaterial({
    size: 0.06,
    vertexColors: true,
    transparent: true,
    opacity: 0.9,
    depthWrite: false,
    depthTest: true,
    blending: THREE.AdditiveBlending,
    sizeAttenuation: true,
    map: starBurstParticleTexture
  });
  
  const starBurstSystem = new THREE.Points(starBurstGeometry, starBurstMaterial);
  starBurstSystem.position.set(0, 1.3, -1.1); // -1.3から-1.1に変更（より手前に）
  starBurstSystem.renderOrder = 1;
  
  // 爆発用のユーザーデータ
  starBurstSystem.userData = {
    velocities: starVelocities,
    burst: true,
    lifetime: 0,
    maxLifetime: 100,
    originalSizes: starSizes.slice(),
    isStar: true // 星型パーティクルであることを示すフラグ
  };
  
  scene.add(starBurstSystem);
  welcomeParticles.push(starBurstSystem);
  console.log('専用の星型パーティクルを追加しました');
  
  // 開始時のパーティクル爆発エフェクト（従来の丸いパーティクル）
  const burstParticles = createBurstParticles();
  burstParticles.position.set(0, 1.3, -1.1); // -1.3から-1.1に変更（より手前に）
  burstParticles.renderOrder = 1; // より低い値にして確実に背面に表示
  scene.add(burstParticles);
  welcomeParticles.push(burstParticles);
  
  // バーストパーティクルの星型パーティクルシステムも追加
  if (burstParticles.userData.starSystem) {
    const starSystem = burstParticles.userData.starSystem;
    starSystem.position.copy(burstParticles.position);
    starSystem.renderOrder = 1;
    scene.add(starSystem);
    welcomeParticles.push(starSystem);
    console.log('大きい星型パーティクル追加');
  }
  
  // バリエーション用に異なるタイプのバースト効果を追加
  const smallBurstParticles = createSmallBurstParticles();
  smallBurstParticles.position.set(0, 1.3, -1.1); // -1.3から-1.1に変更（より手前に）
  smallBurstParticles.renderOrder = 1; // より低い値にして確実に背面に表示
  scene.add(smallBurstParticles);
  welcomeParticles.push(smallBurstParticles);
  
  // 小さいバーストパーティクルの星型パーティクルシステムも追加
  if (smallBurstParticles.userData.starSystem) {
    const starSystem = smallBurstParticles.userData.starSystem;
    starSystem.position.copy(smallBurstParticles.position);
    starSystem.renderOrder = 1;
    scene.add(starSystem);
    welcomeParticles.push(starSystem);
    console.log('小さい星型パーティクル追加');
  }
}

// より小さく速いパーティクルバースト
function createSmallBurstParticles() {
  const particleCount = 200; // 小さいパーティクルはたくさん
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(particleCount * 3);
  const colors = new Float32Array(particleCount * 3);
  const sizes = new Float32Array(particleCount);
  const velocities = [];
  
  // 青～紫～白のカラーパレット（ゴールドと違うバリエーション）
  const coolColors = [
    new THREE.Color(0x4b6cb7), // 青
    new THREE.Color(0x8a6bc9), // 紫
    new THREE.Color(0xb3e5fc), // 水色
    new THREE.Color(0xffffff), // 白
  ];
  
  // 主に上向きに飛び散るパーティクル
  for (let i = 0; i < particleCount; i++) {
    const i3 = i * 3;
    
    // 中心からほぼ0の位置からスタート
    positions[i3] = (Math.random() - 0.5) * 0.05;
    positions[i3 + 1] = (Math.random() - 0.5) * 0.05;
    positions[i3 + 2] = (Math.random() - 0.5) * 0.05;
    
    // 色はランダムに青～紫～白
    const color = coolColors[Math.floor(Math.random() * coolColors.length)];
    colors[i3] = color.r;
    colors[i3 + 1] = color.g;
    colors[i3 + 2] = color.b;
    
    // サイズは小さめ
    sizes[i] = Math.random() * 0.01 + 0.002;
    
    // 速度ベクトル（上向きを中心に広がる）
    const upwardBias = 0.8; // 上向きのバイアス（小さいパーティクルはより上向きに）
    const horizontalSpread = 0.3; // 横方向への広がり（小さいパーティクルは横方向の広がりを抑える）
    
    // 上方向の基本速度（小さいパーティクルは速くする）- 速度を遅くする
    let baseY = Math.random() * 0.03 + 0.025; // 0.05+0.05から0.03+0.025に変更
    
    // 横方向（X, Z）の速度
    const angle = Math.random() * Math.PI * 2; // 水平方向のランダムな角度
    const horizontalSpeed = Math.random() * horizontalSpread * 0.05;
    const vx = Math.cos(angle) * horizontalSpeed;
    const vz = Math.sin(angle) * horizontalSpeed;
    
    // 上方向を維持しつつ、少しだけランダム性を加える
    const vy = baseY * (upwardBias + (1.0 - upwardBias) * Math.random());
    
    velocities.push({
      x: vx,
      y: vy,
      z: vz,
      gravity: Math.random() * 0.0003 + 0.0001, // 重力も軽減
      decay: Math.random() * 0.02 + 0.01 // 減衰率（小さいパーティクルは早めに消える）
    });
  }
  
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
  
  // テクスチャ作成
  const normalParticleTexture = createParticleTexture();
  const starParticleTexture = createStarParticleTexture();
  
  // 通常のパーティクル用マテリアル（半分のパーティクル用）
  const normalMaterial = new THREE.PointsMaterial({
    size: 0.01,
    vertexColors: true,
    transparent: true,
    opacity: 0.7,
    depthWrite: false,
    depthTest: true,
    blending: THREE.AdditiveBlending,
    sizeAttenuation: true,
    map: normalParticleTexture
  });
  
  // 星形パーティクル用マテリアル（残りの半分用）
  const starMaterial = new THREE.PointsMaterial({
    size: 0.025, // より大きく
    vertexColors: true,
    transparent: true,
    opacity: 0.8, // より不透明に
    depthWrite: false,
    depthTest: true,
    blending: THREE.AdditiveBlending,
    sizeAttenuation: true,
    map: starParticleTexture
  });
  
  // 2つのパーティクルシステム作成
  const normalParticleCount = Math.floor(particleCount / 2);
  const starParticleCount = particleCount - normalParticleCount;
  
  // 通常パーティクル用のジオメトリ
  const normalGeometry = new THREE.BufferGeometry();
  normalGeometry.setAttribute('position', new THREE.BufferAttribute(positions.slice(0, normalParticleCount * 3), 3));
  normalGeometry.setAttribute('color', new THREE.BufferAttribute(colors.slice(0, normalParticleCount * 3), 3));
  normalGeometry.setAttribute('size', new THREE.BufferAttribute(sizes.slice(0, normalParticleCount), 1));
  
  // 星型パーティクル用のジオメトリ
  const starGeometry = new THREE.BufferGeometry();
  starGeometry.setAttribute('position', new THREE.BufferAttribute(positions.slice(normalParticleCount * 3), 3));
  starGeometry.setAttribute('color', new THREE.BufferAttribute(colors.slice(normalParticleCount * 3), 3));
  starGeometry.setAttribute('size', new THREE.BufferAttribute(sizes.slice(normalParticleCount), 1));
  
  // 2つのパーティクルシステム作成
  const normalSystem = new THREE.Points(normalGeometry, normalMaterial);
  const starSystem = new THREE.Points(starGeometry, starMaterial);
  
  // メインのパーティクルシステム（通常パーティクル）
  const particleSystem = normalSystem;
  
  // 爆発用のユーザーデータ
  particleSystem.userData = {
    velocities: velocities.slice(0, normalParticleCount),
    burst: true,
    lifetime: 0,
    maxLifetime: 80,
    originalSizes: sizes.slice(0, normalParticleCount)
  };
  
  // 星型パーティクルシステムにも同様のデータを設定
  starSystem.userData = {
    velocities: velocities.slice(normalParticleCount),
    burst: true,
    lifetime: 0,
    maxLifetime: 80,
    originalSizes: sizes.slice(normalParticleCount),
    isStarParticle: true // 星型パーティクルであることを示すフラグ
  };
  
  // 星型パーティクルシステムを親システムに関連付け
  particleSystem.userData.starSystem = starSystem;
  
  return particleSystem;
}

// 既存の爆発パーティクルも修正
function createBurstParticles() {
  const particleCount = 300; // 多めのパーティクル
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(particleCount * 3);
  const colors = new Float32Array(particleCount * 3);
  const sizes = new Float32Array(particleCount);
  const velocities = [];
  
  // カラーパレット（金色〜白）
  const goldColors = [
    new THREE.Color(0xffd700), // ゴールド
    new THREE.Color(0xffec85), // 淡いゴールド
    new THREE.Color(0xffffaa), // 非常に淡いゴールド
    new THREE.Color(0xffffff), // 白
  ];
  
  // 主に上向きに飛び散るパーティクル
  for (let i = 0; i < particleCount; i++) {
    const i3 = i * 3;
    
    // 中心からほぼ0の位置からスタート
    positions[i3] = (Math.random() - 0.5) * 0.1;
    positions[i3 + 1] = (Math.random() - 0.5) * 0.1;
    positions[i3 + 2] = (Math.random() - 0.5) * 0.1;
    
    // 色はランダムに金〜白
    const color = goldColors[Math.floor(Math.random() * goldColors.length)];
    colors[i3] = color.r;
    colors[i3 + 1] = color.g;
    colors[i3 + 2] = color.b;
    
    // サイズもランダム（小さめ〜大きめ）
    sizes[i] = Math.random() * 0.03 + 0.005;
    
    // 速度ベクトル（上向きを中心に広がる）
    const upwardBias = 0.7; // 上向きのバイアス（0.0-1.0、1.0に近いほど上向き）
    const horizontalSpread = 0.4; // 横方向への広がり
    
    // 上方向の基本速度
    let baseY = Math.random() * 0.04 + 0.04; // 上方向のベース速度
    
    // 横方向（X, Z）の速度
    const angle = Math.random() * Math.PI * 2; // 水平方向のランダムな角度
    const horizontalSpeed = Math.random() * horizontalSpread * 0.05;
    const vx = Math.cos(angle) * horizontalSpeed;
    const vz = Math.sin(angle) * horizontalSpeed;
    
    // 上方向を維持しつつ、少しだけランダム性を加える
    const vy = baseY * (upwardBias + (1.0 - upwardBias) * Math.random());
    
    velocities.push({
      x: vx,
      y: vy,
      z: vz,
      gravity: Math.random() * 0.0006 + 0.0002, // 重力を強めに
      decay: Math.random() * 0.01 + 0.005 // 減衰率
    });
  }
  
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
  
  // テクスチャ作成
  const normalParticleTexture = createParticleTexture();
  const starParticleTexture = createStarParticleTexture();
  
  // 通常のパーティクル用マテリアル（半分のパーティクル用）
  const normalMaterial = new THREE.PointsMaterial({
    size: 0.05, // より大きく
    vertexColors: true,
    transparent: true,
    opacity: 0.8, // より不透明に
    depthWrite: false,
    depthTest: true,
    blending: THREE.AdditiveBlending,
    sizeAttenuation: true,
    map: normalParticleTexture
  });
  
  // 星形パーティクル用マテリアル（残りの半分用）
  const starMaterial = new THREE.PointsMaterial({
    size: 0.05, // より大きく
    vertexColors: true,
    transparent: true,
    opacity: 0.8, // より不透明に
    depthWrite: false,
    depthTest: true,
    blending: THREE.AdditiveBlending,
    sizeAttenuation: true,
    map: starParticleTexture
  });
  
  // 2つのパーティクルシステム作成
  const normalParticleCount = Math.floor(particleCount / 2);
  const starParticleCount = particleCount - normalParticleCount;
  
  // 通常パーティクル用のジオメトリ
  const normalGeometry = new THREE.BufferGeometry();
  normalGeometry.setAttribute('position', new THREE.BufferAttribute(positions.slice(0, normalParticleCount * 3), 3));
  normalGeometry.setAttribute('color', new THREE.BufferAttribute(colors.slice(0, normalParticleCount * 3), 3));
  normalGeometry.setAttribute('size', new THREE.BufferAttribute(sizes.slice(0, normalParticleCount), 1));
  
  // 星型パーティクル用のジオメトリ
  const starGeometry = new THREE.BufferGeometry();
  starGeometry.setAttribute('position', new THREE.BufferAttribute(positions.slice(normalParticleCount * 3), 3));
  starGeometry.setAttribute('color', new THREE.BufferAttribute(colors.slice(normalParticleCount * 3), 3));
  starGeometry.setAttribute('size', new THREE.BufferAttribute(sizes.slice(normalParticleCount), 1));
  
  // 2つのパーティクルシステム作成
  const normalSystem = new THREE.Points(normalGeometry, normalMaterial);
  const starSystem = new THREE.Points(starGeometry, starMaterial);
  
  // メインのパーティクルシステム（通常パーティクル）
  const particleSystem = normalSystem;
  
  // 爆発用のユーザーデータ
  particleSystem.userData = {
    velocities: velocities.slice(0, normalParticleCount),
    burst: true,
    lifetime: 0,
    maxLifetime: 100,
    originalSizes: sizes.slice(0, normalParticleCount)
  };
  
  // 星型パーティクルシステムにも同様のデータを設定
  starSystem.userData = {
    velocities: velocities.slice(normalParticleCount),
    burst: true,
    lifetime: 0,
    maxLifetime: 100,
    originalSizes: sizes.slice(normalParticleCount),
    isStarParticle: true // 星型パーティクルであることを示すフラグ
  };
  
  // 星型パーティクルシステムを親システムに関連付け
  particleSystem.userData.starSystem = starSystem;
  
  return particleSystem;
}

// 通常のパーティクルも修正
function createWelcomeParticles() {
  const particleCount = 200; // 100から200に増加
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(particleCount * 3);
  const colors = new Float32Array(particleCount * 3);
  const sizes = new Float32Array(particleCount);
  
  // 金色のパレット（より多様なバリエーション）
  const goldColors = [
    new THREE.Color(0xffd700), // ゴールド
    new THREE.Color(0xf0e68c), // カーキ
    new THREE.Color(0xdaa520), // ゴールデンロッド
    new THREE.Color(0xffe4b5), // モカシン
    new THREE.Color(0xd4af37), // 金色
    new THREE.Color(0xffec85), // 淡いゴールド
    new THREE.Color(0xbda55d)  // 落ち着いたゴールド
  ];
  
  // パーティクル初期設定
  for (let i = 0; i < particleCount; i++) {
    const i3 = i * 3;
    
    // 初期位置は小さな球体内に集中
    const radius = 0.2 + Math.random() * 0.2;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.random() * Math.PI;
    
    positions[i3] = radius * Math.sin(phi) * Math.cos(theta);
    positions[i3 + 1] = radius * Math.sin(phi) * Math.sin(theta);
    positions[i3 + 2] = radius * Math.cos(phi);
    
    // ランダムな金色
    const color = goldColors[Math.floor(Math.random() * goldColors.length)];
    colors[i3] = color.r;
    colors[i3 + 1] = color.g;
    colors[i3 + 2] = color.b;
    
    // サイズもバリエーション
    sizes[i] = Math.random() * 0.03 + 0.01;
  }
  
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
  
  // 通常パーティクルと星型パーティクルに分ける
  const normalParticleCount = Math.ceil(particleCount * 0.7); // 70%は通常パーティクル
  const starParticleCount = particleCount - normalParticleCount; // 30%は星型パーティクル
  
  // 通常パーティクル用のジオメトリ
  const normalGeometry = new THREE.BufferGeometry();
  normalGeometry.setAttribute('position', new THREE.BufferAttribute(positions.slice(0, normalParticleCount * 3), 3));
  normalGeometry.setAttribute('color', new THREE.BufferAttribute(colors.slice(0, normalParticleCount * 3), 3));
  normalGeometry.setAttribute('size', new THREE.BufferAttribute(sizes.slice(0, normalParticleCount), 1));
  
  // 星型パーティクル用のジオメトリ
  const starGeometry = new THREE.BufferGeometry();
  starGeometry.setAttribute('position', new THREE.BufferAttribute(positions.slice(normalParticleCount * 3), 3));
  starGeometry.setAttribute('color', new THREE.BufferAttribute(colors.slice(normalParticleCount * 3), 3));
  starGeometry.setAttribute('size', new THREE.BufferAttribute(sizes.slice(normalParticleCount), 1));
  
  // テクスチャ作成
  const normalParticleTexture = createParticleTexture();
  const starParticleTexture = createStarParticleTexture();
  
  // 通常のパーティクル用マテリアル
  const material = new THREE.PointsMaterial({
    size: 0.05,
    vertexColors: true,
    transparent: true,
    opacity: 0.7,
    depthWrite: false, // 深度書き込みをオフ
    depthTest: true, // 深度テストは有効
    blending: THREE.AdditiveBlending,
    sizeAttenuation: true,
    map: normalParticleTexture
  });
  
  // 星型パーティクル用マテリアル
  const starMaterial = new THREE.PointsMaterial({
    size: 0.05,
    vertexColors: true,
    transparent: true,
    opacity: 0.7,
    depthWrite: false,
    depthTest: true,
    blending: THREE.AdditiveBlending,
    sizeAttenuation: true,
    map: starParticleTexture
  });
  
  // 2つのパーティクルシステム作成
  const normalSystem = new THREE.Points(normalGeometry, material);
  const starSystem = new THREE.Points(starGeometry, starMaterial);
  
  // メインのパーティクルシステム（通常パーティクル）をベースにする
  const particleSystem = normalSystem;
  
  // アニメーション用データ
  const velocities = Array(particleCount).fill().map(() => ({
    x: (Math.random() - 0.5) * 0.002,
    y: (Math.random() - 0.5) * 0.002,
    z: (Math.random() - 0.5) * 0.002
  }));
  
  particleSystem.userData = {
    velocities: velocities.slice(0, normalParticleCount),
    rotationSpeed: (Math.random() - 0.5) * 0.001,
    originalPositions: positions.slice(0, normalParticleCount * 3),
    originalSizes: sizes.slice(0, normalParticleCount),
    starSystem: starSystem, // 星型パーティクルシステムへの参照を保持
  };
  
  // 星型パーティクルシステムにもデータを設定
  starSystem.userData = {
    velocities: velocities.slice(normalParticleCount),
    rotationSpeed: (Math.random() - 0.5) * 0.001,
    originalPositions: positions.slice(normalParticleCount * 3),
    originalSizes: sizes.slice(normalParticleCount),
    isStar: true
  };
  
  // 星型パーティクルシステムをメインシステムの子として追加
  particleSystem.add(starSystem);
  
  return particleSystem;
}

// パーティクル用のテクスチャ作成
function createParticleTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  
  // 輝く光のようなグラデーション
  const gradient = ctx.createRadialGradient(
    canvas.width / 2, canvas.height / 2, 0,
    canvas.width / 2, canvas.height / 2, canvas.width / 2
  );
  
  gradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
  gradient.addColorStop(0.2, 'rgba(255, 255, 220, 0.8)');
  gradient.addColorStop(0.5, 'rgba(255, 220, 150, 0.3)');
  gradient.addColorStop(1, 'rgba(0, 0, 0, 0)'); // 完全に透明に修正
  
  ctx.clearRect(0, 0, canvas.width, canvas.height); // キャンバスをクリア
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(canvas.width / 2, canvas.height / 2, canvas.width / 2, 0, Math.PI * 2);
  ctx.fill();
  
  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

// 星型パーティクル用のテクスチャ作成
function createStarParticleTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  
  const centerX = canvas.width / 2;
  const centerY = canvas.height / 2;
  const outerRadius = canvas.width / 2 - 10;
  const innerRadius = outerRadius / 3; // より明確な星の形のために内側の半径を小さく
  const spikes = 5; // 5つの頂点を持つ星
  
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  
  // 星をより明確に描画
  ctx.beginPath();
  
  // 星を描くための正確な方法
  for (let i = 0; i < spikes * 2; i++) {
    const radius = i % 2 === 0 ? outerRadius : innerRadius;
    const angle = (Math.PI * i) / spikes - Math.PI / 2;
    const x = centerX + radius * Math.cos(angle);
    const y = centerY + radius * Math.sin(angle);
    
    if (i === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  }
  
  ctx.closePath();
  
  // 明るい金色のベースカラー
  ctx.fillStyle = '#FFD700';
  ctx.fill();
  
  // グラデーションを適用（より明るい色に）
  const gradient = ctx.createRadialGradient(
    centerX, centerY, 0,
    centerX, centerY, outerRadius
  );
  
  gradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
  gradient.addColorStop(0.3, 'rgba(255, 255, 220, 0.9)');
  gradient.addColorStop(0.7, 'rgba(255, 220, 150, 0.6)');
  gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
  
  ctx.fillStyle = gradient;
  ctx.fill();
  
  // 星の輪郭を強調
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
  ctx.lineWidth = 3;
  ctx.stroke();
  
  // 光の効果を加える（中心から放射する線）
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  
  // 放射状の線を描画
  for (let i = 0; i < spikes; i++) {
    const angle = (Math.PI * 2 * i) / spikes - Math.PI / 2;
    const x = centerX + outerRadius * 1.2 * Math.cos(angle);
    const y = centerY + outerRadius * 1.2 * Math.sin(angle);
    
    ctx.beginPath();
    ctx.moveTo(centerX, centerY);
    ctx.lineTo(x, y);
    ctx.strokeStyle = 'rgba(255, 255, 200, 0.4)';
    ctx.lineWidth = 2;
    ctx.stroke();
  }
  
  ctx.restore();
  
  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

// お出迎えパーティクルの更新
function updateWelcomeParticles(deltaTime) {
  if (!welcomeParticles || welcomeParticles.length === 0) return;
  
  try {
    for (const particle of welcomeParticles) {
      if (!particle || !particle.geometry || !particle.geometry.attributes) continue;
      
      // 爆発タイプのパーティクル
      if (particle.userData.burst) {
        updateBurstParticles(particle, deltaTime);
        continue;
      }
      
      // システム全体の移動（拡散フェーズ）
      if (particle.userData.expansionPhase) {
        particle.userData.expansionTime += deltaTime;
        
        if (particle.userData.expansionTime < particle.userData.maxExpansionTime) {
          // 拡散中
          const moveDirection = particle.userData.moveDirection;
          const initialPosition = particle.userData.initialPosition;
          const progress = particle.userData.expansionTime / particle.userData.maxExpansionTime;
          
          // イージング関数（徐々に減速）
          const easeOutCubic = 1 - Math.pow(1 - progress, 3);
          const expansion = 3.0 * easeOutCubic; // 最大3ユニットまで拡散
          
          particle.position.x = initialPosition.x + moveDirection.x * expansion;
          particle.position.y = initialPosition.y + moveDirection.y * expansion;
          particle.position.z = initialPosition.z + moveDirection.z * expansion;
        } else {
          // 拡散完了
          particle.userData.expansionPhase = false;
        }
      }
      
      // 回転
      if (particle.userData && particle.userData.rotationSpeed) {
        particle.rotation.y += particle.userData.rotationSpeed;
      }
      
      // パーティクル位置の更新
      const positions = particle.geometry.attributes.position.array;
      if (!positions) continue;
      
      const velocities = particle.userData?.velocities;
      const originalPositions = particle.userData?.originalPositions;
      
      if (!velocities || !originalPositions) continue;
      
      for (let i = 0; i < positions.length / 3; i++) {
        const i3 = i * 3;
        
        // なめらかな揺れ動き（サイン波の利用）
        const time = Date.now() * 0.001;
        const offsetX = Math.sin(time + i * 0.1) * 0.01;
        const offsetY = Math.cos(time + i * 0.1) * 0.01;
        const offsetZ = Math.sin(time * 0.8 + i * 0.1) * 0.01;
        
        if (i3 + 2 < positions.length && i3 + 2 < originalPositions.length) {
          positions[i3] = originalPositions[i3] + offsetX;
          positions[i3 + 1] = originalPositions[i3 + 1] + offsetY;
          positions[i3 + 2] = originalPositions[i3 + 2] + offsetZ;
          
          // 速度でもゆっくり位置を更新
          originalPositions[i3] += velocities[i].x * deltaTime;
          originalPositions[i3 + 1] += velocities[i].y * deltaTime;
          originalPositions[i3 + 2] += velocities[i].z * deltaTime;
          
          // 範囲を超えたら反対側から
          const maxRange = 1.5;
          if (Math.abs(originalPositions[i3]) > maxRange) velocities[i].x *= -1;
          if (Math.abs(originalPositions[i3 + 1]) > maxRange) velocities[i].y *= -1;
          if (Math.abs(originalPositions[i3 + 2]) > maxRange) velocities[i].z *= -1;
        }
      }
      
      particle.geometry.attributes.position.needsUpdate = true;
      
      // キラキラエフェクト（サイズと透明度のアニメーション）
      if (particle.geometry.attributes.size) {
        const time = Date.now() * 0.001;
        const sizes = particle.geometry.attributes.size;
        const sizeArray = sizes.array;
        const originalSizes = particle.userData.originalSizes;
        
        for (let i = 0; i < sizeArray.length; i++) {
          const pulseFactor = 0.3 * Math.sin(time * 2 + i * 0.2) + 1;
          sizeArray[i] = (originalSizes ? originalSizes[i] : 0.02) * pulseFactor;
        }
        
        sizes.needsUpdate = true;
      }
      
      // 全体の透明度もわずかに変化
      if (particle.material) {
        const time = Date.now() * 0.001;
        particle.material.opacity = 0.6 + 0.2 * Math.sin(time * 0.5);
      }
      
      // 星型パーティクルシステムも更新（あれば）
      if (!particle.userData.isStar && particle.userData.starSystem) {
        const starSystem = particle.userData.starSystem;
        
        // 星型パーティクルシステム用の揺れ動きを更新（サイン波をずらす）
        const starPositions = starSystem.geometry.attributes.position.array;
        const starVelocities = starSystem.userData.velocities;
        const starOriginalPositions = starSystem.userData.originalPositions;
        
        if (starPositions && starVelocities && starOriginalPositions) {
          const time = Date.now() * 0.001 + 0.5; // 通常パーティクルと位相をずらす
          
          for (let i = 0; i < starPositions.length / 3; i++) {
            const i3 = i * 3;
            
            // 星用の揺れ動き（通常より大きめに）
            const offsetX = Math.sin(time + i * 0.12) * 0.015;
            const offsetY = Math.cos(time + i * 0.12) * 0.015;
            const offsetZ = Math.sin(time * 0.9 + i * 0.12) * 0.015;
            
            if (i3 + 2 < starPositions.length && i3 + 2 < starOriginalPositions.length) {
              starPositions[i3] = starOriginalPositions[i3] + offsetX;
              starPositions[i3 + 1] = starOriginalPositions[i3 + 1] + offsetY;
              starPositions[i3 + 2] = starOriginalPositions[i3 + 2] + offsetZ;
              
              // 速度でもゆっくり位置を更新
              starOriginalPositions[i3] += starVelocities[i].x * deltaTime;
              starOriginalPositions[i3 + 1] += starVelocities[i].y * deltaTime;
              starOriginalPositions[i3 + 2] += starVelocities[i].z * deltaTime;
              
              // 範囲を超えたら反対側から
              const maxRange = 1.5;
              if (Math.abs(starOriginalPositions[i3]) > maxRange) starVelocities[i].x *= -1;
              if (Math.abs(starOriginalPositions[i3 + 1]) > maxRange) starVelocities[i].y *= -1;
              if (Math.abs(starOriginalPositions[i3 + 2]) > maxRange) starVelocities[i].z *= -1;
            }
          }
          
          starSystem.geometry.attributes.position.needsUpdate = true;
          
          // 星型パーティクルのキラキラ効果（通常より強め）
          if (starSystem.geometry.attributes.size) {
            const time = Date.now() * 0.001 + 0.5; // 時間をずらす
            const sizes = starSystem.geometry.attributes.size;
            const sizeArray = sizes.array;
            const originalSizes = starSystem.userData.originalSizes;
            
            for (let i = 0; i < sizeArray.length; i++) {
              const pulseFactor = 0.4 * Math.sin(time * 2.2 + i * 0.3) + 1;
              sizeArray[i] = (originalSizes ? originalSizes[i] : 0.02) * pulseFactor;
            }
            
            sizes.needsUpdate = true;
          }
          
          // 星型パーティクルの透明度変化（通常より強め）
          if (starSystem.material) {
            const time = Date.now() * 0.001 + 0.5;
            starSystem.material.opacity = 0.65 + 0.25 * Math.sin(time * 0.7);
          }
        }
      }
    }
  } catch (e) {
    console.error('エラー in updateWelcomeParticles:', e);
  }
}

// 爆発エフェクトのパーティクル更新
function updateBurstParticles(particle, deltaTime) {
  const positions = particle.geometry.attributes.position.array;
  const velocities = particle.userData.velocities;
  
  // ライフタイム更新
  particle.userData.lifetime += deltaTime;
  const progress = particle.userData.lifetime / particle.userData.maxLifetime;
  
  // すべてのパーティクルを更新
  for (let i = 0; i < positions.length / 3; i++) {
    const i3 = i * 3;
    const vel = velocities[i];
    
    // 重力と減衰を適用した位置更新
    positions[i3] += vel.x;
    positions[i3 + 1] += vel.y;
    positions[i3 + 2] += vel.z;
    
    // 速度の更新（重力と減衰）
    vel.y -= vel.gravity;
    vel.x *= (1 - vel.decay);
    vel.y *= (1 - vel.decay);
    vel.z *= (1 - vel.decay);
  }
  
  particle.geometry.attributes.position.needsUpdate = true;
  
  // 全体の透明度減少
  particle.material.opacity = 1 - Math.pow(progress, 0.7);
  
  // サイズの縮小
  if (particle.geometry.attributes.size) {
    const sizes = particle.geometry.attributes.size.array;
    const originalSizes = particle.userData.originalSizes;
    
    for (let i = 0; i < sizes.length; i++) {
      sizes[i] = originalSizes[i] * (1 - Math.pow(progress, 0.5));
    }
    
    particle.geometry.attributes.size.needsUpdate = true;
  }
  
  // 星型パーティクルシステムがある場合は同期させる
  if (!particle.userData.isStarParticle && particle.userData.starSystem) {
    const starSystem = particle.userData.starSystem;
    // ライフタイムが同じになるように更新
    starSystem.userData.lifetime = particle.userData.lifetime;
    updateBurstParticles(starSystem, 0); // deltaTimeは0、既に更新済みのため
  }
  
  // ライフタイム終了したらシーンから削除
  if (progress >= 1) {
    scene.remove(particle);
    const index = welcomeParticles.indexOf(particle);
    if (index > -1) {
      welcomeParticles.splice(index, 1);
    }
    
    // 星型パーティクルシステムも削除
    if (!particle.userData.isStarParticle && particle.userData.starSystem) {
      const starSystem = particle.userData.starSystem;
      scene.remove(starSystem);
      const starIndex = welcomeParticles.indexOf(starSystem);
      if (starIndex > -1) {
        welcomeParticles.splice(starIndex, 1);
      }
    }
  }
}

// お出迎え効果音の再生
function playWelcomeSound() {
  if (!listener || !listener.context) {
    console.warn('Audio listener not initialized');
    return;
  }
  
  const context = listener.context;
  const gainNode = context.createGain();
  gainNode.connect(context.destination);
  gainNode.gain.value = 0.3;
  
  // 複数の音源を組み合わせてきらびやかな効果音
  const oscillators = [];
  
  try {
    // キラキラ音①（高音）
    const osc1 = context.createOscillator();
    osc1.type = 'sine';
    osc1.frequency.value = 880; // A5
    osc1.connect(gainNode);
    
    // キラキラ音②（さらに高音）
    const osc2 = context.createOscillator();
    osc2.type = 'triangle';
    osc2.frequency.value = 1174.66; // D6
    osc2.connect(gainNode);
    
    // 音量エンベロープ
    gainNode.gain.setValueAtTime(0, context.currentTime);
    gainNode.gain.linearRampToValueAtTime(0.3, context.currentTime + 0.1);
    gainNode.gain.linearRampToValueAtTime(0.2, context.currentTime + 1.0);
    gainNode.gain.linearRampToValueAtTime(0, context.currentTime + 3.0);
    
    // 開始
    osc1.start(context.currentTime);
    osc2.start(context.currentTime + 0.1);
    
    // 終了
    osc1.stop(context.currentTime + 3.0);
    osc2.stop(context.currentTime + 3.0);
    
    oscillators.push(osc1, osc2);
    
    // 別の音（滑らかな下降音）
    setTimeout(() => {
      try {
        const osc3 = context.createOscillator();
        osc3.type = 'sine';
        osc3.frequency.setValueAtTime(1500, context.currentTime);
        osc3.frequency.exponentialRampToValueAtTime(500, context.currentTime + 2.0);
        
        const gain3 = context.createGain();
        gain3.gain.setValueAtTime(0, context.currentTime);
        gain3.gain.linearRampToValueAtTime(0.2, context.currentTime + 0.1);
        gain3.gain.linearRampToValueAtTime(0, context.currentTime + 2.0);
        
        osc3.connect(gain3).connect(context.destination);
        osc3.start();
        osc3.stop(context.currentTime + 2.0);
        
        oscillators.push(osc3);
      } catch (e) {
        console.error('Error playing second welcome sound:', e);
      }
    }, 500);
  } catch (e) {
    console.error('Error playing welcome sound:', e);
  }
}

// -------------------------------
// グリップ操作によるボード移動
// -------------------------------
function onSqueezeStart(event) {
  const controllerIndex = controllers.indexOf(event.target);
  isGripping[controllerIndex] = true;
  controllers[controllerIndex].getWorldPosition(controllerInitialPositions[controllerIndex]);
  if (board) {
    board.getWorldPosition(boardInitialPosition);
  }
}

function onSqueezeEnd(event) {
  const controllerIndex = controllers.indexOf(event.target);
  isGripping[controllerIndex] = false;
}

// -------------------------------
// ゲーム初期化
// -------------------------------
function initializeGame() {
  // 既存の花火をクリア
  if (window.fireworksInterval) {
    clearInterval(window.fireworksInterval);
    window.fireworksInterval = null;
  }
  
  // 花火の音を停止
  if (window.fireworkSoundTimeout) {
    clearTimeout(window.fireworkSoundTimeout);
    window.fireworkSoundTimeout = null;
  }
  
  // 花火フラグをオフに
  window.fireworksActive = false;
  
  // 残りの花火エフェクトをシーンから削除
  for (let i = fireworks.length - 1; i >= 0; i--) {
    scene.remove(fireworks[i]);
  }
  fireworks = [];
  
  // 難易度選択メニューを削除
  if (difficultyMenu) {
    scene.remove(difficultyMenu);
    difficultyMenu = null;
  }
  
  // ゲーム結果メニューがあれば削除
  if (gameResultMenu) {
    scene.remove(gameResultMenu);
    gameResultMenu = null;
  }
  
  // 既存のボードを削除
  if (board) {
    scene.remove(board);
    pieces = [];
  }
  
  // 盤面を作成
  board = createBoard();
  board.position.set(0, 0.7, -0.7); // 高さを0.9から0.7に下げる
  
  // 盤面の全要素を透明に設定
  board.traverse(child => {
    if (child.material && child.material.transparent !== undefined) {
      child.material.transparent = true;
      child.material.opacity = 0;
    }
  });
  
  // フェードイン用のユーザーデータを追加
  board.userData = {
    fadeIn: true,
    fadeProgress: 0,
    fadeSpeed: 0.008, // フェードイン速度を遅く
    initialY: 1.2,    // 開始位置（上から）
    targetY: 0.7,     // 目標位置
    rotationProgress: 0, // 回転アニメーション用
    glowIntensity: 0,   // 光るエフェクト用
    glowDirection: 1    // 光の強さの変化方向
  };
  
  // 初期位置を上に設定
  board.position.y = board.userData.initialY;
  
  scene.add(board);
  
  // 盤のベースメッシュを取得
  boardBase = board.getObjectByName('boardBase');
  
  // ステータス表示を盤の上に配置
  statusDisplay = createStatusDisplay();
  statusDisplay.position.set(0, 0.3, -0.2); // 高さを上げ、手前に出す
  statusDisplay.rotation.x = 0.2; // 少し傾けて見やすく
  board.add(statusDisplay);
  
  // カーソル作成
  boardCursor = createBoardCursor();
  board.add(boardCursor);
  boardCursor.visible = false;
  
  // 持ち駒ケースを初期化
  initPieceCases();
  
  // 駒の配置（初期化時は直接配置）
  updatePieces();
  
  // ゲーム状態の初期化
  gameStarted = true;
  flippingPieces = []; // アニメーション中の駒をクリア
  
  // 交互に先手後手を入れ替え（最初のゲームはプレイヤー先行）
  if (playerWins + cpuWins + draws === 0) {
    isPlayerTurn = true;
    currentPlayer = 1;
    updateGameMessage('ゲーム開始: プレイヤー（黒）の番です');
    // 最初のプレイヤーの有効手マーカーを遅延表示
    setTimeout(() => {
      showValidMoves(1);
    }, 500);
  } else {
    // 2戦目以降は勝敗に応じて先手後手を変える（勝った方が後手）
    if (gameResultMenu && gameResultMenu.userData && gameResultMenu.userData.playerWon) {
      // プレイヤーが勝っていた場合はCPU先行
      isPlayerTurn = false;
      currentPlayer = -1;
      updateGameMessage('ゲーム開始: CPU（白）の番です');
      setTimeout(makeCPUMove, 300);
    } else {
      // CPUが勝っていた場合またはドローの場合はプレイヤー先行
      isPlayerTurn = true;
      currentPlayer = 1;
      updateGameMessage('ゲーム開始: プレイヤー（黒）の番です');
      // プレイヤーの有効手マーカーを遅延表示
      setTimeout(() => {
        showValidMoves(1);
      }, 500);
    }
  }
  
  moveCount = 0;
  updateStatus();
  
  // 開始効果音
  playSound('start');
}

// -------------------------------
// パーティクルシステム
// -------------------------------
function createParticleSystem() {
  const particleCount = 20; // パーティクル数を減らす
  
  // ジオメトリの作成
  const particleGeometry = new THREE.BufferGeometry();
  const positions = new Float32Array(particleCount * 3);
  const colors = new Float32Array(particleCount * 3);
  const sizes = new Float32Array(particleCount);
  
  // パーティクルの初期設定
  for (let i = 0; i < particleCount; i++) {
    const i3 = i * 3;
    
    // より自然な初期位置（円形に広がる）
    const angle = (i / particleCount) * Math.PI * 2;
    const radius = 0.02;
    positions[i3] = Math.cos(angle) * radius;
    positions[i3 + 1] = 0.02; // 少し上から開始
    positions[i3 + 2] = Math.sin(angle) * radius;
    
    // より自然な色（白から透明へ）
    colors[i3] = 1;
    colors[i3 + 1] = 1;
    colors[i3 + 2] = 1;
    
    // サイズ
    sizes[i] = Math.random() * 0.005 + 0.003;
  }
  
  particleGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  particleGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  particleGeometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
  
  // より自然なパーティクル用のマテリアル
  const particleMaterial = new THREE.PointsMaterial({
    size: 0.005,
    vertexColors: true,
    transparent: true,
    opacity: 0.8,
    blending: THREE.AdditiveBlending,
    sizeAttenuation: true,
  });
  
  const particleSystem = new THREE.Points(particleGeometry, particleMaterial);
  particleSystem.userData = {
    velocities: Array(particleCount).fill().map(() => ({
      x: (Math.random() - 0.5) * 0.01,
      y: Math.random() * 0.01 + 0.005,
      z: (Math.random() - 0.5) * 0.01
    })),
    lifetime: 0,
    maxLifetime: 60
  };
  
  return particleSystem;
}

// 輪っかパーティクルシステムの作成
function createRingParticleSystem() {
  const particleCount = 30; // 輪の粒子数
  
  // ジオメトリの作成
  const particleGeometry = new THREE.BufferGeometry();
  const positions = new Float32Array(particleCount * 3);
  const colors = new Float32Array(particleCount * 3);
  const sizes = new Float32Array(particleCount);
  
  // 初期半径
  const initialRadius = 0.01;
  
  // パーティクルの初期設定
  for (let i = 0; i < particleCount; i++) {
    const i3 = i * 3;
    
    // 輪っか状に配置
    const angle = (i / particleCount) * Math.PI * 2;
    positions[i3] = Math.cos(angle) * initialRadius;     // X座標
    positions[i3 + 1] = 0.01;                           // Y座標 (駒の上に表示)
    positions[i3 + 2] = Math.sin(angle) * initialRadius; // Z座標
    
    // 色 (白〜黄色系で輝く)
    colors[i3] = 1.0;                   // 赤 (R)
    colors[i3 + 1] = 0.9 + Math.random() * 0.1; // 緑 (G)
    colors[i3 + 2] = 0.7 + Math.random() * 0.3; // 青 (B)
    
    // サイズ (小さめで均一)
    sizes[i] = 0.003 + Math.random() * 0.002;
  }
  
  particleGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  particleGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  particleGeometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
  
  // 輝くパーティクル用のマテリアル
  const particleMaterial = new THREE.PointsMaterial({
    size: 0.004,
    vertexColors: true,
    transparent: true,
    opacity: 0.9,
    blending: THREE.AdditiveBlending,
    sizeAttenuation: true,
  });
  
  const particleSystem = new THREE.Points(particleGeometry, particleMaterial);
  particleSystem.userData = {
    initialRadius: initialRadius,
    expandSpeed: 0.002,  // 拡大速度
    rotateSpeed: 0.03,   // 回転速度
    lifetime: 0,
    maxLifetime: 45      // ライフタイム
  };
  
  return particleSystem;
}

// パーティクルシステムの更新
function updateParticles(delta) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const particle = particles[i];
    
    // ライフタイム更新
    particle.userData.lifetime += delta;
    
    if (particle.userData.lifetime > particle.userData.maxLifetime) {
      // ライフタイム終了で削除
      board.remove(particle);
      particles.splice(i, 1);
      continue;
    }
    
    // 不透明度を徐々に下げる
    const lifeRatio = particle.userData.lifetime / particle.userData.maxLifetime;
    particle.material.opacity = 1 - lifeRatio;
    
    // 輪っかパーティクルの特殊更新
    if (particle.userData.initialRadius !== undefined) {
      // 輪っかの半径を徐々に大きくする
      const positions = particle.geometry.attributes.position.array;
      const particleCount = positions.length / 3;
      const currentRadius = particle.userData.initialRadius + (lifeRatio * 0.05);
      
      // 回転角度を更新
      const rotateAngle = particle.userData.lifetime * particle.userData.rotateSpeed;
      
      for (let j = 0; j < particleCount; j++) {
        const j3 = j * 3;
        const originalAngle = (j / particleCount) * Math.PI * 2;
        const newAngle = originalAngle + rotateAngle;
        
        // 新しい位置を計算
        positions[j3] = Math.cos(newAngle) * currentRadius;
        positions[j3 + 1] = 0.01 + lifeRatio * 0.01; // 少しずつ上昇
        positions[j3 + 2] = Math.sin(newAngle) * currentRadius;
      }
      
      particle.geometry.attributes.position.needsUpdate = true;
    } else {
      // 従来のパーティクル更新処理
      const positions = particle.geometry.attributes.position.array;
      const velocities = particle.userData.velocities;
      
      for (let j = 0; j < positions.length / 3; j++) {
        const j3 = j * 3;
        
        // 位置を速度に基づいて更新
        positions[j3] += velocities[j].x;
        positions[j3 + 1] += velocities[j].y;
        positions[j3 + 2] += velocities[j].z;
        
        // 重力効果
        velocities[j].y -= 0.0003;
      }
      
      particle.geometry.attributes.position.needsUpdate = true;
    }
  }
  
  // 花火の更新
  for (let i = fireworks.length - 1; i >= 0; i--) {
    const firework = fireworks[i];
    
    // ライフタイム更新
    firework.userData.lifetime += delta;
    
    if (firework.userData.lifetime > firework.userData.maxLifetime) {
      // ライフタイム終了で削除
      scene.remove(firework);
      fireworks.splice(i, 1);
      continue;
    }
    
    // 花火のパーティクル更新
    const positions = firework.geometry.attributes.position.array;
    const velocities = firework.userData.velocities;
    const colors = firework.geometry.attributes.color.array;
    
    for (let j = 0; j < positions.length / 3; j++) {
      const j3 = j * 3;
      const velocity = velocities[j];
      
      // 個別パーティクルのライフタイム更新
      velocity.lifetime += delta;
      const particleProgress = velocity.lifetime / velocity.maxLifetime;
      
      if (particleProgress < 1) {
        // 位置を速度に基づいて更新
        positions[j3] += velocity.x;
        positions[j3 + 1] += velocity.y;
        positions[j3 + 2] += velocity.z;
        
        // 重力効果
        velocity.y -= velocity.gravity;
        
        // 速度の減衰
        velocity.x *= (1 - velocity.decay * delta * 0.1);
        velocity.y *= (1 - velocity.decay * delta * 0.1);
        velocity.z *= (1 - velocity.decay * delta * 0.1);
        
        // 色の輝度を徐々に下げる（パーティクルごとに異なる減衰）
        const fadeRatio = particleProgress;
        const colorFade = 1 - fadeRatio * fadeRatio; // 二次関数で減衰（後半で急速に暗くなる）
        
        colors[j3] *= colorFade;
        colors[j3 + 1] *= colorFade;
        colors[j3 + 2] *= colorFade;
      } else {
        // パーティクルの寿命が尽きたら透明に
        colors[j3] = 0;
        colors[j3 + 1] = 0;
        colors[j3 + 2] = 0;
      }
    }
    
    firework.geometry.attributes.position.needsUpdate = true;
    firework.geometry.attributes.color.needsUpdate = true;
    
    // 全体の進行状況
    const lifeRatio = firework.userData.lifetime / firework.userData.maxLifetime;
    
    // サイズを徐々に小さく（パターン別の効果）
    if (firework.userData.patternType === 0) {
      // 球状爆発は通常の縮小
      firework.material.size = firework.userData.initialSize * (1 - lifeRatio * 0.5);
    } else if (firework.userData.patternType === 1) {
      // リング状爆発はゆっくり縮小
      firework.material.size = firework.userData.initialSize * (1 - lifeRatio * 0.3);
    } else {
      // 星型爆発は最後まで大きめをキープ
      firework.material.size = firework.userData.initialSize * (1 - lifeRatio * 0.4);
    }
    
    // 不透明度も調整
    firework.material.opacity = 1 - lifeRatio * lifeRatio; // 二次関数で減衰
  }
}

// 駒配置時のパーティクル効果
function createPlacementEffect(x, z) {
  // 輪っかパーティクルエフェクトを作成
  const ringParticle = createRingParticleSystem();
  
  // 駒の位置に配置 (boardXとboardZの計算を合わせる)
  const boardX = -0.25 + 0.03125 + (x * 0.0625);
  const boardZ = -0.25 + 0.03125 + (z * 0.0625);
  
  // 駒の上に配置
  ringParticle.position.set(boardX, 0.04, boardZ);
  
  board.add(ringParticle);
  particles.push(ringParticle);
  
  // 星型パーティクルエフェクトも追加（約30%の確率で）
  if (Math.random() < 0.3) {
    const starParticle = createStarRingParticleSystem();
    starParticle.position.set(boardX, 0.04, boardZ);
    board.add(starParticle);
    particles.push(starParticle);
  }
}

// 星型の輪っかパーティクルシステムの作成
function createStarRingParticleSystem() {
  const particleCount = 20; // 星の数（輪の粒子数より少なめ）
  
  // ジオメトリの作成
  const particleGeometry = new THREE.BufferGeometry();
  const positions = new Float32Array(particleCount * 3);
  const colors = new Float32Array(particleCount * 3);
  const sizes = new Float32Array(particleCount);
  
  // 初期半径
  const initialRadius = 0.015;
  
  // パーティクルの初期設定
  for (let i = 0; i < particleCount; i++) {
    const i3 = i * 3;
    
    // 輪っか状に配置
    const angle = (i / particleCount) * Math.PI * 2;
    positions[i3] = Math.cos(angle) * initialRadius;     // X座標
    positions[i3 + 1] = 0.01;                           // Y座標 (駒の上に表示)
    positions[i3 + 2] = Math.sin(angle) * initialRadius; // Z座標
    
    // 色 (金色系で輝く)
    colors[i3] = 1.0;                   // 赤 (R)
    colors[i3 + 1] = 0.8 + Math.random() * 0.2; // 緑 (G)
    colors[i3 + 2] = 0.4 + Math.random() * 0.3; // 青 (B)
    
    // サイズ (小さめで均一)
    sizes[i] = 0.004 + Math.random() * 0.003;
  }
  
  particleGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  particleGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  particleGeometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
  
  // 星型パーティクル用マテリアル
  const particleMaterial = new THREE.PointsMaterial({
    size: 0.005,
    vertexColors: true,
    transparent: true,
    opacity: 0.9,
    blending: THREE.AdditiveBlending,
    sizeAttenuation: true,
    map: createStarParticleTexture()
  });
  
  const particleSystem = new THREE.Points(particleGeometry, particleMaterial);
  particleSystem.userData = {
    initialRadius: initialRadius,
    expandSpeed: 0.003,  // 拡大速度（通常より速め）
    rotateSpeed: -0.04,   // 回転速度（逆回転）
    lifetime: 0,
    maxLifetime: 40      // ライフタイム
  };
  
  return particleSystem;
}

// 勝利時の花火効果
function createFireworks() {
  // グローバル変数でフラグを設定
  window.fireworksActive = true;
  
  // 最初に5発の花火を打ち上げる
  for (let i = 0; i < 5; i++) {
    setTimeout(() => {
      launchFirework();
    }, i * 300); // 時間差で発射
  }
  
  // 継続的に花火を打ち上げる（再スタートされるまで）
  window.fireworksInterval = setInterval(() => {
    // 1～3発をランダムに打ち上げる
    const count = Math.floor(Math.random() * 3) + 1;
    for (let i = 0; i < count; i++) {
      setTimeout(() => {
        if (window.fireworksActive) {
          launchFirework();
        }
      }, i * 200 + Math.random() * 500);
    }
  }, 2000); // 2秒ごとに新しい花火グループを打ち上げ
  
  // 効果音
  playSound('win');
  
  // 花火の音も再生（一度だけ）
  playFireworkSound();
}

// 花火一発の作成
function launchFirework() {
  const particleCount = 200; // 150から200に増やして密度アップ
  const fireworkGeometry = new THREE.BufferGeometry();
  const positions = new Float32Array(particleCount * 3);
  const colors = new Float32Array(particleCount * 3);
  const sizes = new Float32Array(particleCount);
  const velocities = [];
  
  // 花火の色をランダムに決定（より鮮やかな色合いに）
  const hue = Math.random();
  const fireworkColor = new THREE.Color().setHSL(
    hue,
    0.8 + Math.random() * 0.2, // 彩度を高く
    0.6 + Math.random() * 0.2  // 明度も高め
  );
  
  // 補色も用意（２色の花火に）
  const complementaryColor = new THREE.Color().setHSL(
    (hue + 0.5) % 1.0,
    0.8 + Math.random() * 0.2,
    0.6 + Math.random() * 0.2
  );
  
  // 発射位置をランダムに
  const startX = (Math.random() - 0.5) * 2;
  const startY = 1.5;
  const startZ = -1 + (Math.random() - 0.5) * 0.5;
  
  // 爆発パターンのバリエーション（3種類）
  const patternType = Math.floor(Math.random() * 3);
  
  // パーティクルサイズの設定（より小さくリアルに）
  for (let i = 0; i < particleCount; i++) {
    const i3 = i * 3;
    
    // 中心点から
    positions[i3] = startX;
    positions[i3 + 1] = startY;
    positions[i3 + 2] = startZ;
    
    // 花火の色（2色のグラデーション）
    if (Math.random() > 0.5) {
      colors[i3] = fireworkColor.r;
      colors[i3 + 1] = fireworkColor.g;
      colors[i3 + 2] = fireworkColor.b;
    } else {
      colors[i3] = complementaryColor.r;
      colors[i3 + 1] = complementaryColor.g;
      colors[i3 + 2] = complementaryColor.b;
    }
    
    // サイズをより小さく設定
    sizes[i] = Math.random() * 0.015 + 0.005; // 0.05から大幅に縮小
    
    // 爆発パターンに応じた速度ベクトル
    let speed, angle1, angle2, vx, vy, vz;
    
    switch (patternType) {
      case 0: // 球状爆発
        speed = Math.random() * 0.02 + 0.01;
        angle1 = Math.random() * Math.PI * 2;
        angle2 = Math.random() * Math.PI;
        
        vx = Math.sin(angle2) * Math.cos(angle1) * speed;
        vy = Math.cos(angle2) * speed;
        vz = Math.sin(angle2) * Math.sin(angle1) * speed;
        break;
        
      case 1: // リング状爆発
        speed = Math.random() * 0.01 + 0.015;
        angle1 = Math.random() * Math.PI * 2;
        // 水平方向に近い角度に制限
        angle2 = (Math.PI / 2) + (Math.random() - 0.5) * Math.PI * 0.2;
        
        vx = Math.sin(angle2) * Math.cos(angle1) * speed;
        vy = Math.cos(angle2) * speed * 0.5; // Y方向の速度を抑制
        vz = Math.sin(angle2) * Math.sin(angle1) * speed;
        break;
        
      case 2: // 多重星型爆発
        speed = Math.random() * 0.02 + 0.01;
        // 特定の角度に集中させる
        const segments = 8; // 星の尖った部分の数
        const segmentIndex = Math.floor(Math.random() * segments);
        angle1 = (segmentIndex / segments) * Math.PI * 2 + (Math.random() - 0.5) * 0.2;
        angle2 = Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 0.5;
        
        vx = Math.sin(angle2) * Math.cos(angle1) * speed;
        vy = Math.cos(angle2) * speed;
        vz = Math.sin(angle2) * Math.sin(angle1) * speed;
        break;
    }
    
    // 速度にわずかなランダム変動を加える
    vx += (Math.random() - 0.5) * 0.005;
    vy += (Math.random() - 0.5) * 0.005;
    vz += (Math.random() - 0.5) * 0.005;
    
    velocities.push({ 
      x: vx, 
      y: vy, 
      z: vz,
      // 重力効果を少し強く
      gravity: Math.random() * 0.0004 + 0.0002, 
      // 減衰も調整
      decay: Math.random() * 0.01 + 0.005,
      // 各パーティクルに個別の寿命を設定
      lifetime: 0,
      maxLifetime: 70 + Math.random() * 30
    });
  }
  
  fireworkGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  fireworkGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  fireworkGeometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
  
  // 輝く粒子のマテリアル
  const fireworkMaterial = new THREE.PointsMaterial({
    size: 0.02, // デフォルトサイズも小さく
    vertexColors: true,
    transparent: true,
    opacity: 1,
    blending: THREE.AdditiveBlending,
    sizeAttenuation: true,
  });
  
  const firework = new THREE.Points(fireworkGeometry, fireworkMaterial);
  firework.userData = {
    velocities: velocities,
    lifetime: 0,
    maxLifetime: 100,
    initialSize: 0.02, // 初期サイズも小さく
    patternType: patternType, // パターンタイプを保存
    color: fireworkColor // 色情報も保存
  };
  
  scene.add(firework);
  fireworks.push(firework);
  
  // 花火の音再生
  playRandomFireworkSound();
  
  // 星型パーティクルを追加（約30%の確率）
  if (Math.random() < 0.3) {
    const starCount = Math.floor(particleCount / 3);
    const starGeometry = new THREE.BufferGeometry();
    const starPositions = new Float32Array(starCount * 3);
    const starColors = new Float32Array(starCount * 3);
    const starSizes = new Float32Array(starCount);
    const starVelocities = [];
    
    // 星型パーティクルにも同じような配置と速度を設定
    for (let i = 0; i < starCount; i++) {
      const i3 = i * 3;
      
      starPositions[i3] = startX;
      starPositions[i3 + 1] = startY;
      starPositions[i3 + 2] = startZ;
      
      if (Math.random() > 0.5) {
        starColors[i3] = fireworkColor.r;
        starColors[i3 + 1] = fireworkColor.g;
        starColors[i3 + 2] = fireworkColor.b;
      } else {
        starColors[i3] = complementaryColor.r;
        starColors[i3 + 1] = complementaryColor.g;
        starColors[i3 + 2] = complementaryColor.b;
      }
      
      // 星は少し大きめに
      starSizes[i] = Math.random() * 0.02 + 0.01;
      
      let speed, angle1, angle2, vx, vy, vz;
      
      // 星も同じパターンで飛ばす
      switch (patternType) {
        case 0:
          speed = Math.random() * 0.02 + 0.01;
          angle1 = Math.random() * Math.PI * 2;
          angle2 = Math.random() * Math.PI;
          
          vx = Math.sin(angle2) * Math.cos(angle1) * speed;
          vy = Math.cos(angle2) * speed;
          vz = Math.sin(angle2) * Math.sin(angle1) * speed;
          break;
          
        case 1:
          speed = Math.random() * 0.01 + 0.015;
          angle1 = Math.random() * Math.PI * 2;
          angle2 = (Math.PI / 2) + (Math.random() - 0.5) * Math.PI * 0.2;
          
          vx = Math.sin(angle2) * Math.cos(angle1) * speed;
          vy = Math.cos(angle2) * speed * 0.5;
          vz = Math.sin(angle2) * Math.sin(angle1) * speed;
          break;
          
        case 2:
          speed = Math.random() * 0.02 + 0.01;
          const segments = 8;
          const segmentIndex = Math.floor(Math.random() * segments);
          angle1 = (segmentIndex / segments) * Math.PI * 2 + (Math.random() - 0.5) * 0.2;
          angle2 = Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 0.5;
          
          vx = Math.sin(angle2) * Math.cos(angle1) * speed;
          vy = Math.cos(angle2) * speed;
          vz = Math.sin(angle2) * Math.sin(angle1) * speed;
          break;
      }
      
      vx += (Math.random() - 0.5) * 0.005;
      vy += (Math.random() - 0.5) * 0.005;
      vz += (Math.random() - 0.5) * 0.005;
      
      starVelocities.push({ 
        x: vx, 
        y: vy, 
        z: vz,
        gravity: Math.random() * 0.0004 + 0.0002,
        decay: Math.random() * 0.01 + 0.005,
        lifetime: 0,
        maxLifetime: 60 + Math.random() * 20 // 星は少し短めの寿命
      });
    }
    
    starGeometry.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
    starGeometry.setAttribute('color', new THREE.BufferAttribute(starColors, 3));
    starGeometry.setAttribute('size', new THREE.BufferAttribute(starSizes, 1));
    
    // 星型パーティクル用マテリアル
    const starMaterial = new THREE.PointsMaterial({
      size: 0.025,
      vertexColors: true,
      transparent: true,
      opacity: 1,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true,
      map: createStarParticleTexture()
    });
    
    const starFirework = new THREE.Points(starGeometry, starMaterial);
    starFirework.userData = {
      velocities: starVelocities,
      lifetime: 0,
      maxLifetime: 80,
      initialSize: 0.025,
      isStar: true,
      patternType: patternType
    };
    
    scene.add(starFirework);
    fireworks.push(starFirework);
  }
}

// -------------------------------
// Three.js 初期化
// -------------------------------
function init() {
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
  
  renderer = new THREE.WebGLRenderer({
    canvas: document.getElementById('canvas'),
    antialias: true,
    alpha: true
  });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); // デバイスピクセル比を制限
  
  // シャドウマップを有効化
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap; // ソフトシャドウを使用
  
  // 照明設定 - 環境光の強度を元に戻す
  // 環境光
  scene.add(new THREE.AmbientLight(0x404060, 0.5)); // 0.6から0.5に戻す
  
  // メインの平行光源（上から）
  const mainLight = new THREE.DirectionalLight(0xffffff, 0.9); // 0.9はそのまま
  mainLight.position.set(0, 10, 5);
  mainLight.castShadow = true;
  // シャドウマップの設定を調整（高品質な影用）
  mainLight.shadow.mapSize.width = 256;  // シャドウマップのサイズを最適化
  mainLight.shadow.mapSize.height = 256;
  mainLight.shadow.camera.near = 1;
  mainLight.shadow.camera.far = 30;
  // 影のエリアを制限してシャープさを向上
  mainLight.shadow.camera.left = -2;
  mainLight.shadow.camera.right = 2;
  mainLight.shadow.camera.top = 2;
  mainLight.shadow.camera.bottom = -2;
  mainLight.shadow.bias = -0.0005; // 影のアクネ（ちらつき）を軽減
  scene.add(mainLight);
  
  // 補助光（側面から柔らかい光）
  const fillLight1 = new THREE.DirectionalLight(0x8090ff, 0.4);
  fillLight1.position.set(-5, 3, 5);
  // 補助光も影を落とす（より柔らかい影を追加）
  fillLight1.castShadow = false;
  fillLight1.shadow.mapSize.width = 1024;
  fillLight1.shadow.mapSize.height = 1024;
  fillLight1.shadow.camera.near = 0.5;
  fillLight1.shadow.camera.far = 30;
  fillLight1.shadow.camera.left = -1;
  fillLight1.shadow.camera.right = 1;
  fillLight1.shadow.camera.top = 1;
  fillLight1.shadow.camera.bottom = -1;
  fillLight1.shadow.bias = -0.0003;
  scene.add(fillLight1);
  
  // バックライト（裏側から）
  const backLight = new THREE.DirectionalLight(0x4060a0, 0.4); // 0.4はそのまま
  backLight.position.set(5, 7, -10);
  scene.add(backLight);
  
  // 追加の光源（右側面から）- 盤面の光沢を強調
  const rightLight = new THREE.DirectionalLight(0xffffcc, 0.3); // 暖かい色の光
  rightLight.position.set(8, 4, 2);
  scene.add(rightLight);
  
  // 追加の光源（左側面から）- 盤面の光沢をさらに強調
  const leftLight = new THREE.DirectionalLight(0xccffff, 0.3); // 涼しい色の光
  leftLight.position.set(-8, 4, 2);
  scene.add(leftLight);
  
  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });
  
  document.getElementById('startButton').addEventListener('click', startXRSession);
  
  // ページ読み込み時にVR機器のサポート状況をチェック
  checkVRSupport();
}

// -------------------------------
// リッチなオセロ盤作成 - ボードベースのマテリアル設定を元に戻す
// -------------------------------
function createBoard() {
  const boardGroup = new THREE.Group();
  
  // 高級木材風のテクスチャ作成
  function createWoodTexture(color1, color2, grainSize = 10) {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');
    
    // 背景色
    ctx.fillStyle = color1;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // 木目パターン
    ctx.fillStyle = color2;
    
    for (let i = 0; i < canvas.height; i += grainSize) {
      const lineWidth = Math.random() * 3 + 1;
      const yPos = i + Math.random() * grainSize;
      ctx.globalAlpha = Math.random() * 0.4 + 0.1;
      ctx.fillRect(0, yPos, canvas.width, lineWidth);
    }
    
    // テクスチャを反映
    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    return texture;
  }
  
  // マーブル調テクスチャ
  function createMarbleTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');
    
    // 背景
    ctx.fillStyle = '#f5f5f5';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // 大理石の模様
    for (let i = 0; i < 20; i++) {
      const gradient = ctx.createRadialGradient(
        Math.random() * canvas.width,
        Math.random() * canvas.height,
        0,
        Math.random() * canvas.width,
        Math.random() * canvas.height,
        Math.random() * 100 + 50
      );
      
      gradient.addColorStop(0, `rgba(200, 200, 200, ${Math.random() * 0.3})`);
      gradient.addColorStop(1, 'rgba(200, 200, 200, 0)');
      
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    
    // 細かい筋
    for (let i = 0; i < 10; i++) {
      ctx.strokeStyle = `rgba(150, 150, 150, ${Math.random() * 0.2 + 0.1})`;
      ctx.lineWidth = Math.random() * 2 + 0.5;
      
      ctx.beginPath();
      ctx.moveTo(Math.random() * canvas.width, 0);
      ctx.bezierCurveTo(
        Math.random() * canvas.width, Math.random() * canvas.height,
        Math.random() * canvas.width, Math.random() * canvas.height,
        Math.random() * canvas.width, canvas.height
      );
      ctx.stroke();
    }
    
    const texture = new THREE.CanvasTexture(canvas);
    return texture;
  }
  
  // 豪華なボードベース（高級木材風）
  const boardTexture = createWoodTexture('#804000', '#5a2800', 15);
  const baseMaterial = new THREE.MeshStandardMaterial({ 
    map: boardTexture,
    roughness: 0.5, // 0.4から0.5に戻す
    metalness: 0.2, // 0.25から0.2に戻す
    bumpMap: boardTexture,
    bumpScale: 0.02,
    envMapIntensity: 0.5 // 環境マップの反射強度はそのまま
  });
  
  // 底面（厚み感を出す）
  const baseGeometry = new THREE.BoxGeometry(0.6, 0.05, 0.6);
  const base = new THREE.Mesh(baseGeometry, baseMaterial);
  base.position.y = -0.02;
  // 影の設定を追加
  base.castShadow = true;
  base.receiveShadow = true;
  boardGroup.add(base);
  
  // 枠（外周）
  const frameGeometry = new THREE.BoxGeometry(0.56, 0.03, 0.56);
  const frameMaterial = new THREE.MeshStandardMaterial({ 
    color: 0x3d2b1f, 
    roughness: 0.35, // 0.4から0.35に変更して光沢を増す
    metalness: 0.3,
    envMapIntensity: 0.4 // 環境マップの反射強度を追加
  });
  const frame = new THREE.Mesh(frameGeometry, frameMaterial);
  frame.position.y = 0.01;
  // 影の設定を追加
  frame.castShadow = true;
  frame.receiveShadow = true;
  boardGroup.add(frame);
  
  // プレイエリア（緑の部分）- より光沢のあるマテリアルに変更
  const boardGeometry = new THREE.BoxGeometry(0.5, 0.02, 0.5);
  const playAreaMaterial = new THREE.MeshPhysicalMaterial({ 
    color: 0x006400,
    roughness: 0.5,
    metalness: 0.35, // 0.3から0.35に変更して反射を強化
    reflectivity: 0.5, // 0.4から0.5に上げて反射を強化
    clearcoat: 0.3, // 0.2から0.3に上げて光沢を強化
    clearcoatRoughness: 0.2, // 0.3から0.2に下げてよりつややかに
    envMapIntensity: 0.7 // 環境マップの反射強度を上げる
  });
  boardBase = new THREE.Mesh(boardGeometry, playAreaMaterial);
  boardBase.position.y = 0.02;
  boardBase.name = 'boardBase';
  // 影の設定を追加
  boardBase.castShadow = true;
  boardBase.receiveShadow = true;
  boardGroup.add(boardBase);
  
  // グリッドライン（より精細でエレガントな線）
  const gridMaterial = new THREE.LineBasicMaterial({ 
    color: 0x000000,
    linewidth: 2,
    transparent: true,
    opacity: 0.7
  });
  
  for (let i = 0; i <= 8; i++) {
    const y = 0.031; // ボード表面より少し上
    const startX = -0.25 + (i * 0.0625);
    
    const points = [ 
      new THREE.Vector3(startX, y, -0.25), 
      new THREE.Vector3(startX, y, 0.25) 
    ];
    
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    boardGroup.add(new THREE.Line(geometry, gridMaterial));
  }
  
  for (let i = 0; i <= 8; i++) {
    const y = 0.031;
    const startZ = -0.25 + (i * 0.0625);
    
    const points = [ 
      new THREE.Vector3(-0.25, y, startZ), 
      new THREE.Vector3(0.25, y, startZ) 
    ];
    
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    boardGroup.add(new THREE.Line(geometry, gridMaterial));
  }
  
  // セルの点（交差点に小さな点）
  const dotGeometry = new THREE.SphereGeometry(0.004, 8, 8);
  const dotMaterial = new THREE.MeshStandardMaterial({ color: 0x000000 });
  
  for (let i = 0; i <= 8; i++) {
    for (let j = 0; j <= 8; j++) {
      const dot = new THREE.Mesh(dotGeometry, dotMaterial);
      dot.position.set(-0.25 + (i * 0.0625), 0.032, -0.25 + (j * 0.0625));
      boardGroup.add(dot);
    }
  }
  
  // 和風装飾の追加（お茶碗を削除し、木の置物のみに）
  const decorationGroup = new THREE.Group();
  decorationGroup.position.y = 0.02; // 盤面と同じ高さ
  
  // 松の木（ミニチュア）- 標準タイプ
  function createMiniPineTree() {
    const treeGroup = new THREE.Group();
    
    // 幹 - より光沢のあるマテリアルに変更
    const trunkGeometry = new THREE.CylinderGeometry(0.01, 0.02, 0.1, 8);
    const trunkMaterial = new THREE.MeshStandardMaterial({ 
      color: 0x4a2f1c,
      roughness: 0.5,
      metalness: 0.2, // 反射効果を追加
      envMapIntensity: 0.3 // 環境マップの反射を追加
    });
    const trunk = new THREE.Mesh(trunkGeometry, trunkMaterial);
    treeGroup.add(trunk);
    
    // 葉（円錐形）- より光沢のあるマテリアルに変更
    const leavesGeometry = new THREE.ConeGeometry(0.05, 0.15, 8);
    const leavesMaterial = new THREE.MeshStandardMaterial({ 
      color: 0x2d5a27,
      roughness: 0.6,
      metalness: 0.15, // 反射効果を追加
      envMapIntensity: 0.25 // 環境マップの反射を追加
    });
    const leaves = new THREE.Mesh(leavesGeometry, leavesMaterial);
    leaves.position.y = 0.1;
    treeGroup.add(leaves);
    
    // 木の根元に草を追加
    const grass = createGrass();
    grass.position.y = -0.05; // 根元に配置（y=0は幹の中心なので、-0.05で根元になる）
    treeGroup.add(grass);
    
    return treeGroup;
  }
  
  // 岩と組み合わせた松の木（左上用）
  function createRockyPineTree() {
    const treeGroup = new THREE.Group();
    
    // 幹（少し曲がった形状）
    const trunkGeometry = new THREE.CylinderGeometry(0.008, 0.015, 0.12, 8);
    const trunkMaterial = new THREE.MeshStandardMaterial({ 
      color: 0x3a2512,
      roughness: 0.6,
      metalness: 0.15
    });
    const trunk = new THREE.Mesh(trunkGeometry, trunkMaterial);
    trunk.rotation.z = Math.PI * 0.05; // 少し傾ける
    treeGroup.add(trunk);
    
    // 葉（より大きい円錐形）
    const leavesGeometry = new THREE.ConeGeometry(0.055, 0.17, 10);
    const leavesMaterial = new THREE.MeshStandardMaterial({ 
      color: 0x1d4018, // 少し濃い緑
      roughness: 0.7,
      metalness: 0.12
    });
    const leaves = new THREE.Mesh(leavesGeometry, leavesMaterial);
    leaves.position.y = 0.115;
    leaves.position.x = 0.008; // 幹の傾きに合わせる
    treeGroup.add(leaves);
    
    // 岩の追加
    const rockGroup = new THREE.Group();
    
    // 大きな岩
    const rock1Geometry = new THREE.DodecahedronGeometry(0.025, 0);
    const rockMaterial = new THREE.MeshStandardMaterial({
      color: 0x777777,
      roughness: 0.8,
      metalness: 0.1
    });
    const rock1 = new THREE.Mesh(rock1Geometry, rockMaterial);
    rock1.position.set(-0.02, -0.05, 0.02);
    rock1.rotation.set(Math.random(), Math.random(), Math.random());
    rock1.scale.y = 0.7;
    rockGroup.add(rock1);
    
    // 小さな岩
    const rock2Geometry = new THREE.DodecahedronGeometry(0.015, 0);
    const rock2 = new THREE.Mesh(rock2Geometry, rockMaterial);
    rock2.position.set(0.02, -0.05, -0.01);
    rock2.rotation.set(Math.random(), Math.random(), Math.random());
    rock2.scale.y = 0.6;
    rockGroup.add(rock2);
    
    treeGroup.add(rockGroup);
    
    // 少し草も追加
    const grass = createGrass(5); // 少なめの草
    grass.position.y = -0.05;
    treeGroup.add(grass);
    
    return treeGroup;
  }
  
  // 豊富な苔や下草を伴う松の木（右上用）
  function createMossyPineTree() {
    const treeGroup = new THREE.Group();
    
    // 幹
    const trunkGeometry = new THREE.CylinderGeometry(0.01, 0.018, 0.09, 8);
    const trunkMaterial = new THREE.MeshStandardMaterial({ 
      color: 0x5a3d2a,
      roughness: 0.4,
      metalness: 0.2
    });
    const trunk = new THREE.Mesh(trunkGeometry, trunkMaterial);
    treeGroup.add(trunk);
    
    // 葉（丸みを帯びた円錐形）
    const leavesGeometry = new THREE.SphereGeometry(0.05, 8, 8);
    leavesGeometry.scale(1, 1.5, 1); // 縦長に変形
    const leavesMaterial = new THREE.MeshStandardMaterial({ 
      color: 0x2e632d, // 明るめの緑
      roughness: 0.5,
      metalness: 0.2
    });
    const leaves = new THREE.Mesh(leavesGeometry, leavesMaterial);
    leaves.position.y = 0.1;
    treeGroup.add(leaves);
    
    // 苔の作成（平面の集合）
    const mossGroup = new THREE.Group();
    for(let i = 0; i < 12; i++) {
      const mossGeometry = new THREE.CircleGeometry(0.02 + Math.random() * 0.02, 5);
      const mossColor = new THREE.Color(0x1d5e1b); // 基本色
      // ランダムな色の変化を加える
      mossColor.r += (Math.random() - 0.5) * 0.1;
      mossColor.g += (Math.random() - 0.5) * 0.1;
      mossColor.b += (Math.random() - 0.5) * 0.05;
      
      const mossMaterial = new THREE.MeshStandardMaterial({
        color: mossColor,
        roughness: 0.9,
        metalness: 0.0,
        side: THREE.DoubleSide
      });
      
      const moss = new THREE.Mesh(mossGeometry, mossMaterial);
      moss.rotation.x = -Math.PI / 2; // 地面に対して水平に
      moss.position.set(
        (Math.random() - 0.5) * 0.06,
        -0.05 + Math.random() * 0.005,
        (Math.random() - 0.5) * 0.06
      );
      mossGroup.add(moss);
    }
    treeGroup.add(mossGroup);
    
    // 豊富な下草
    const grass = createGrass(20); // 多めの草
    grass.position.y = -0.05;
    treeGroup.add(grass);
    
    return treeGroup;
  }
  
  // 枝のある松の木（右下用）
  function createBranchyPineTree() {
    const treeGroup = new THREE.Group();
    
    // 幹
    const trunkGeometry = new THREE.CylinderGeometry(0.008, 0.016, 0.11, 8);
    const trunkMaterial = new THREE.MeshStandardMaterial({ 
      color: 0x5c4032,
      roughness: 0.5,
      metalness: 0.15
    });
    const trunk = new THREE.Mesh(trunkGeometry, trunkMaterial);
    treeGroup.add(trunk);
    
    // メインの葉（円錐形）
    const mainLeavesGeometry = new THREE.ConeGeometry(0.045, 0.13, 8);
    const leavesMaterial = new THREE.MeshStandardMaterial({ 
      color: 0x306844, // 青緑色
      roughness: 0.6,
      metalness: 0.1
    });
    const mainLeaves = new THREE.Mesh(mainLeavesGeometry, leavesMaterial);
    mainLeaves.position.y = 0.09;
    treeGroup.add(mainLeaves);
    
    // 枝を追加
    const branches = [
      { angle: Math.PI * 0.2, height: 0.04, length: 0.04, size: 0.006 },
      { angle: Math.PI * 0.7, height: 0.05, length: 0.035, size: 0.005 },
      { angle: Math.PI * 1.2, height: 0.03, length: 0.03, size: 0.004 },
      { angle: Math.PI * 1.8, height: 0.06, length: 0.035, size: 0.006 }
    ];
    
    branches.forEach(branch => {
      // 枝
      const branchGeometry = new THREE.CylinderGeometry(branch.size * 0.5, branch.size, branch.length, 5);
      const branchMaterial = new THREE.MeshStandardMaterial({
        color: 0x3d2b1c,
        roughness: 0.7,
        metalness: 0.05
      });
      
      const branchMesh = new THREE.Mesh(branchGeometry, branchMaterial);
      branchMesh.position.y = branch.height;
      branchMesh.position.x = Math.sin(branch.angle) * 0.01;
      branchMesh.position.z = Math.cos(branch.angle) * 0.01;
      branchMesh.rotation.z = Math.PI / 2 - branch.angle;
      branchMesh.rotation.y = branch.angle;
      
      // 枝先の葉
      const branchLeafGeometry = new THREE.SphereGeometry(branch.size * 2, 6, 6);
      const branchLeaf = new THREE.Mesh(branchLeafGeometry, leavesMaterial);
      branchLeaf.position.x = branch.length * 0.7;
      branchMesh.add(branchLeaf);
      
      treeGroup.add(branchMesh);
    });
    
    // 根元の草
    const grass = createGrass(8);
    grass.position.y = -0.05;
    treeGroup.add(grass);
    
    return treeGroup;
  }
  
  // 大きめの松の木（左下用）- サイズと色も変えたバージョン
  function createLargePineTree() {
    const treeGroup = new THREE.Group();
    
    // 太い幹
    const trunkGeometry = new THREE.CylinderGeometry(0.015, 0.025, 0.08, 8);
    const trunkMaterial = new THREE.MeshStandardMaterial({ 
      color: 0x6d4c33, // より明るい茶色
      roughness: 0.7,
      metalness: 0.1
    });
    const trunk = new THREE.Mesh(trunkGeometry, trunkMaterial);
    treeGroup.add(trunk);
    
    // 葉の形状を改善する
    const leafGeometry = new THREE.SphereGeometry(0.03, 6, 6);
    leafGeometry.scale(1, 0.4, 1); // 扁平な葉の形状
    
    // 緑の葉のマテリアル
    const leafMaterial = new THREE.MeshStandardMaterial({
      color: 0x4a8038,
      roughness: 0.7, 
      metalness: 0.1,
      side: THREE.DoubleSide
    });
    
    // より安定した樹冠構造を作成
    const foliageGroup = new THREE.Group();
    
    // メインの葉の塊を作成（樹冠）
    const foliageCount = 15;
    for (let i = 0; i < foliageCount; i++) {
      const leaf = new THREE.Mesh(leafGeometry, leafMaterial);
      
      // 樹冠内でのランダムな位置
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.random() * Math.PI * 0.5;
      const radius = 0.035 + Math.random() * 0.015;
      
      const x = radius * Math.sin(phi) * Math.cos(theta);
      const y = 0.07 + radius * Math.cos(phi);
      const z = radius * Math.sin(phi) * Math.sin(theta);
      
      leaf.position.set(x, y, z);
      
      // ランダムな回転
      leaf.rotation.x = Math.random() * Math.PI;
      leaf.rotation.y = Math.random() * Math.PI;
      leaf.rotation.z = Math.random() * Math.PI;
      
      // ランダムなスケーリング
      const scale = 0.8 + Math.random() * 0.4;
      leaf.scale.set(scale, scale, scale);
      
      // 色の微妙な変化
      leaf.material = leafMaterial.clone();
      leaf.material.color.offsetHSL(0, 0, (Math.random() - 0.5) * 0.1);
      
      foliageGroup.add(leaf);
    }
    
    // 側面の葉（より小さく）
    const sideFoliageCount = 10;
    for (let i = 0; i < sideFoliageCount; i++) {
      const leaf = new THREE.Mesh(leafGeometry, leafMaterial);
      
      // 幹の周りの側面にランダムに配置
      const angle = Math.random() * Math.PI * 2;
      const height = 0.02 + Math.random() * 0.05;
      const radius = 0.025 + Math.random() * 0.01;
      
      leaf.position.set(
        Math.cos(angle) * radius,
        height,
        Math.sin(angle) * radius
      );
      
      // ランダムな回転
      leaf.rotation.x = Math.random() * Math.PI;
      leaf.rotation.y = Math.random() * Math.PI;
      leaf.rotation.z = Math.random() * Math.PI;
      
      // より小さく
      const scale = 0.5 + Math.random() * 0.3;
      leaf.scale.set(scale, scale, scale);
      
      // 色の微妙な変化
      leaf.material = leafMaterial.clone();
      leaf.material.color.offsetHSL(0, 0, (Math.random() - 0.5) * 0.1);
      
      foliageGroup.add(leaf);
    }
    
    // 簡易的な枝を数本追加
    const branchCount = 5;
    const branchMaterial = new THREE.MeshStandardMaterial({
      color: 0x5a3d28,
      roughness: 0.8,
      metalness: 0.05
    });
    
    for (let i = 0; i < branchCount; i++) {
      const branchLength = 0.03 + Math.random() * 0.02;
      const branchGeometry = new THREE.CylinderGeometry(0.002, 0.004, branchLength, 5);
      const branch = new THREE.Mesh(branchGeometry, branchMaterial);
      
      // 枝の位置（幹の中心から外側に向かって）
      const angle = (i / branchCount) * Math.PI * 2;
      const height = 0.02 + (i / branchCount) * 0.05;
      
      // 枝の位置を幹の表面に合わせる
      const trunkRadius = 0.015; // 幹の半径
      branch.position.set(
        Math.cos(angle) * trunkRadius,
        height,
        Math.sin(angle) * trunkRadius
      );
      
      // 枝の向きを調整（幹から外側に向かって）
      branch.rotation.z = Math.PI / 2;
      branch.rotation.y = angle;
      
      treeGroup.add(branch);
    }
    
    treeGroup.add(foliageGroup);
    
    // 全体のスケールを調整
    treeGroup.scale.set(1.1, 1.1, 1.1);
    
    return treeGroup;
  }
  
  // 草 - 草の数を指定できるように変更
  function createGrass(grassCount = 10) {
    const grassGroup = new THREE.Group();
    
    for (let i = 0; i < grassCount; i++) {
      const grassGeometry = new THREE.CylinderGeometry(0.001, 0.001, 0.05, 4);
      const grassMaterial = new THREE.MeshStandardMaterial({ 
        color: 0x2d5a27,
        roughness: 0.7,
        metalness: 0.1, // 反射効果を追加
        envMapIntensity: 0.2 // 環境マップの反射を追加
      });
      const grass = new THREE.Mesh(grassGeometry, grassMaterial);
      
      // 根元周辺にランダムに配置
      grass.position.x = (Math.random() - 0.5) * 0.04; // 範囲を狭く
      grass.position.z = (Math.random() - 0.5) * 0.04; // 範囲を狭く
      grass.rotation.x = Math.random() * Math.PI * 2;
      grass.rotation.z = Math.random() * Math.PI * 2;
      
      grassGroup.add(grass);
    }
    
    return grassGroup;
  }
  
  // 装飾の配置 - 各コーナーに異なるタイプの松を配置
  const decorations = [
    { create: createRockyPineTree, position: new THREE.Vector3(-0.32, 0, -0.32) },    // 左上: 岩と組み合わせた松
    { create: createMossyPineTree, position: new THREE.Vector3(0.32, 0, -0.32) },     // 右上: 苔や下草を伴う松
    { create: createBranchyPineTree, position: new THREE.Vector3(0.32, 0, 0.32) },    // 右下: 枝のある松
    { create: createLargePineTree, position: new THREE.Vector3(-0.32, 0, 0.32) }      // 左下: 大きめの松
  ];
  
  // 装飾の追加（草は木の根元に追加済みなので別途追加しない）
  decorations.forEach(decoration => {
    const obj = decoration.create();
    obj.position.copy(decoration.position);
    // 装飾オブジェクトに影を設定
    obj.traverse(child => {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });
    decorationGroup.add(obj);
  });
  
  boardGroup.add(decorationGroup);
  
  return boardGroup;
}

// -------------------------------
// 洗練された盤面カーソル
// -------------------------------
function createBoardCursor() {
  const cursorGroup = new THREE.Group();
  
  // 半透明の平面（セル全体）
  const planeGeometry = new THREE.PlaneGeometry(0.0625, 0.0625);
  const planeMaterial = new THREE.MeshBasicMaterial({
    color: 0xffffaa,
    transparent: true,
    opacity: 0.4,
    side: THREE.DoubleSide
  });
  const plane = new THREE.Mesh(planeGeometry, planeMaterial);
  plane.rotation.x = -Math.PI / 2; // 盤面に合わせて水平に
  cursorGroup.add(plane);
  
  // 枠線（エッジをハイライト）
  const edgeGeometry = new THREE.EdgesGeometry(planeGeometry);
  const edgeMaterial = new THREE.LineBasicMaterial({
    color: 0xffff00,
    transparent: true,
    opacity: 0.8,
    linewidth: 2
  });
  const edges = new THREE.LineSegments(edgeGeometry, edgeMaterial);
  edges.rotation.x = -Math.PI / 2;
  cursorGroup.add(edges);
  
  // 角の装飾（小さな球体）
  const sphereGeometry = new THREE.SphereGeometry(0.003, 8, 8);
  const sphereMaterial = new THREE.MeshBasicMaterial({ color: 0xffff00 });
  
  // 四隅に小さな球体を配置
  const cornerPositions = [
    [-0.03125, 0, -0.03125],
    [ 0.03125, 0, -0.03125],
    [-0.03125, 0,  0.03125],
    [ 0.03125, 0,  0.03125]
  ];
  
  cornerPositions.forEach(pos => {
    const sphere = new THREE.Mesh(sphereGeometry, sphereMaterial);
    sphere.position.set(pos[0], 0.001, pos[2]);
    cursorGroup.add(sphere);
  });
  
  cursorGroup.visible = false;
  return cursorGroup;
}

// -------------------------------
// 高級感のある駒の作成
// -------------------------------
function createPiece(x, z, player) {
  const radius = 0.028; // 半径を0.03から0.028に縮小
  const height = 0.004; // 高さも0.005から0.004に調整
  const segments = 32;
  const radiusSegments = 32; // 円周の分割数
  const edgeRadius = 0.0025; // エッジの丸み
  
  // 高級感のある駒のジオメトリ（エッジを丸くする）
  const geometry = new THREE.CylinderGeometry(radius, radius, height, segments, 1, false, 0, Math.PI * 2);
  
  // エッジを滑らかにする
  geometry.vertices = bevelCylinderEdges(geometry.vertices, radius, height, edgeRadius);
  
  let material;
  if (player === 1) {
    // 黒駒（艶のある黒檀風）
    material = new THREE.MeshPhysicalMaterial({
      color: 0x111111,
      metalness: 0.15,  // 0.1から0.15に変更
      roughness: 0.15,  // 0.2から0.15に変更でより艶やかに
      reflectivity: 0.6, // 0.5から0.6に変更
      clearcoat: 0.4,    // 0.3から0.4に変更
      clearcoatRoughness: 0.15 // 0.2から0.15に変更
    });
  } else {
    // 白駒（大理石風）
    material = new THREE.MeshPhysicalMaterial({
      color: 0xf5f5f5,  // より純白に
      metalness: 0.12,  // 0.1から0.12に変更
      roughness: 0.25,  // 0.3から0.25に変更
      reflectivity: 0.8, // 0.7から0.8に変更
      clearcoat: 0.6,    // 0.5から0.6に変更
      clearcoatRoughness: 0.08 // 0.1から0.08に変更
    });
  }
  
  const piece = new THREE.Mesh(geometry, material);
  
  // セル中央に配置：左下(-0.25,-0.25)から各セル0.0625、中央は+0.03125
  const boardX = -0.25 + 0.03125 + (x * 0.0625);
  const boardZ = -0.25 + 0.03125 + (z * 0.0625);
  
  // 水平に配置（回転を修正）- 注意: これが駒の向きの修正
  // 回転をリセット
  piece.rotation.x = 0;
  piece.position.set(boardX, 0.035, boardZ); // Y位置を0.035に設定
  
  // 影を落とす・受ける設定を追加
  piece.castShadow = true;
  piece.receiveShadow = true;
  
  board.add(piece);
  pieces.push({ mesh: piece, x: x, z: z, player: player });
  
  return piece;
}

// 円柱のエッジを滑らかにする関数
function bevelCylinderEdges(vertices, radius, height, edgeRadius) {
  // このバージョンのThree.jsでは直接ジオメトリの頂点をいじる代わりに
  // BufferGeometryを使って新しく作り直す方が良いですが、
  // 簡易的な実装として空関数を返しておきます
  return vertices;
}

function updatePieces() {
  // 既存の駒を削除
  for (const piece of pieces) {
    board.remove(piece.mesh);
  }
  pieces = [];
  
  // 盤面状態に基づいて駒を再作成
  for (let i = 0; i < 8; i++) {
    for (let j = 0; j < 8; j++) {
      if (boardState[i][j] !== 0) {
        createPiece(j, i, boardState[i][j]);
      }
    }
  }
}

// -------------------------------
// 有効手判定
// -------------------------------
function isValidMove(row, col, player) {
  if (boardState[row][col] !== 0) return false;
  
  const directions = [
    [-1, -1], [-1, 0], [-1, 1],
    [ 0, -1],          [ 0, 1],
    [ 1, -1], [ 1, 0], [ 1, 1]
  ];
  
  for (const [dx, dy] of directions) {
    let x = row + dx, y = col + dy;
    let foundOpponent = false;
    
    while (x >= 0 && x < 8 && y >= 0 && y < 8 && boardState[x][y] === -player) {
      x += dx;
      y += dy;
      foundOpponent = true;
    }
    
    if (foundOpponent && x >= 0 && x < 8 && y >= 0 && y < 8 && boardState[x][y] === player) {
      return true;
    }
  }
  
  return false;
}

// -------------------------------
// 駒配置と挟んだ駒反転（パーティクル効果付き）
// -------------------------------
function placePiece(row, col, player, startPosition) {
  boardState[row][col] = player;
      
  const directions = [
    [-1, -1], [-1, 0], [-1, 1],
    [ 0, -1],          [ 0, 1],
    [ 1, -1], [ 1, 0], [ 1, 1]
  ];
      
  let flippedPieces = [];
      
  for (const [dx, dy] of directions) {
    let flips = [];
    let x = row + dx, y = col + dy;
        
    while (x >= 0 && x < 8 && y >= 0 && y < 8 && boardState[x][y] === -player) {
      flips.push([x, y]);
      x += dx;
      y += dy;
    }
        
    if (flips.length > 0 && x >= 0 && x < 8 && y >= 0 && y < 8 && boardState[x][y] === player) {
      for (const [fx, fy] of flips) {
        boardState[fx][fy] = player;
        flippedPieces.push([fx, fy]);
      }
    }
  }
      
  moveCount++;
  updateStatus();
  
  // 新しい駒のアニメーションを開始（ひっくり返す駒の情報も渡す）
  startPieceDropAnimation(row, col, player, startPosition, flippedPieces);
      
  // 相手のターンになったら有効手マーカーをクリア
  clearValidMoveMarkers();

  // ターンを相手に交代
  currentPlayer = -player;

  // ひっくり返すアニメーションは駒が置かれた後に実行されるため、ここでは設定だけ
  // 実際のアニメーション開始はupdateDroppingPieces内で駒の設置完了後に行われる
}

// 駒をひっくり返すアニメーションを開始する関数
function startFlipAnimation(row, col, player) {
  // 既存の駒があれば探す
  let existingPiece = null;
  for (let i = 0; i < pieces.length; i++) {
    if (pieces[i].x === col && pieces[i].z === row) {
      existingPiece = pieces[i].mesh;
      break;
    }
  }

  // 既存の駒がなければ新しく作る
  if (!existingPiece) {
    return;
  }

  // 影の設定を確認
  if (!existingPiece.castShadow) {
    existingPiece.castShadow = true;
    existingPiece.receiveShadow = true;
  }

  // アニメーション情報を設定
  flippingPieces.push({
    mesh: existingPiece,
    player: player,
    originalY: 0.035, // 元のY位置を0.035に設定
    targetY: 0.032,   // 目標のY位置を0.032に設定
    frame: 0, // アニメーションフレーム
    row: row,
    col: col,
    completed: false, // アニメーション完了フラグ
    soundPlayed: false // 効果音フラグ（1回だけ再生するため）
  });
}

// 駒のフリップアニメーションを更新する関数
function updateFlippingPieces(deltaTime) {
  if (flippingPieces.length === 0) return;

  // デルタタイムに乗数を適用してアニメーション速度を調整
  const adjustedDelta = deltaTime * DELTA_MULTIPLIER;

  for (let i = flippingPieces.length - 1; i >= 0; i--) {
    const piece = flippingPieces[i];
    
    // フレームを進める
    piece.frame += adjustedDelta;
    
    if (piece.frame <= FLIP_RISE_TIME) {
      // 上昇フェーズ
      const progress = piece.frame / FLIP_RISE_TIME;
      const easeProgress = easeOutQuint(progress); // より自然な上昇カーブ
      piece.mesh.position.y = piece.originalY + (FLIP_RISE_HEIGHT * easeProgress);
      
      // 上昇中に少し回転を始める（より自然な動き）
      if (progress > 0.3) {
        const preRotationProgress = (progress - 0.3) / 0.7;
        piece.mesh.rotation.x = Math.PI * 0.2 * preRotationProgress;
      }
    } 
    else if (piece.frame <= FLIP_RISE_TIME + FLIP_ROTATE_TIME) {
      // 回転フェーズ
      const progress = (piece.frame - FLIP_RISE_TIME) / FLIP_ROTATE_TIME;
      const easeProgress = easeInOutSine(progress); // よりスムーズな回転カーブ
      
      // X軸回転（180度）- よりスムーズに
      piece.mesh.rotation.x = Math.PI * (0.2 + easeProgress * 0.8);
      
      // 回転中は高さを維持し、回転の進行に合わせて徐々に下がる
      const heightFactor = 1.0 - Math.pow(progress, 2) * 0.3;
      piece.mesh.position.y = piece.originalY + FLIP_RISE_HEIGHT * heightFactor;
      
      // 回転の途中で材質を変更
      if (progress >= 0.4 && progress <= 0.6 && !piece.materialChanging) {
        piece.materialChanging = true;
        
        // 材質変更を滑らかにするため、一時的に透明度を下げる
        piece.mesh.material.transparent = true;
        piece.mesh.material.opacity = 0.6;
        
        // 少し遅れて色を変更
        setTimeout(() => {
          if (!piece.mesh) return; // 既に削除されている場合は何もしない
          
          // 材質を反対の色に変更
          piece.mesh.material = piece.player === 1 ?
            new THREE.MeshPhysicalMaterial({
              color: 0x111111,
              metalness: 0.15,  // 0.1から0.15に変更
              roughness: 0.15,  // 0.2から0.15に変更でより艶やかに
              reflectivity: 0.6, // 0.5から0.6に変更
              clearcoat: 0.4,    // 0.3から0.4に変更
              clearcoatRoughness: 0.15 // 0.2から0.15に変更
            }) :
            new THREE.MeshPhysicalMaterial({
              color: 0xf5f5f5,  // より純白に
              metalness: 0.12,  // 0.1から0.12に変更
              roughness: 0.25,  // 0.3から0.25に変更
              reflectivity: 0.8, // 0.7から0.8に変更
              clearcoat: 0.6,    // 0.5から0.6に変更
              clearcoatRoughness: 0.08 // 0.1から0.08に変更
            });
          
          // 影の設定を維持
          piece.mesh.castShadow = true;
          piece.mesh.receiveShadow = true;
          
          // 透明度を徐々に戻す
          setTimeout(() => {
            if (!piece.mesh || !piece.mesh.material) return;
            piece.mesh.material.opacity = 0.8;
            
            setTimeout(() => {
              if (!piece.mesh || !piece.mesh.material) return;
              piece.mesh.material.opacity = 1.0;
              piece.mesh.material.transparent = false;
              piece.materialChanged = true;
            }, 50);
          }, 50);
        }, 50);
      }
    } 
    else if (piece.frame <= FLIP_DURATION) {
      // 下降フェーズ
      const progress = (piece.frame - FLIP_RISE_TIME - FLIP_ROTATE_TIME) / FLIP_FALL_TIME;
      const easeProgress = easeInQuint(progress); // より自然な下降カーブ
      const targetY = piece.targetY; // 目標の高さ（0.032）
      
      // 現在の高さから目標の高さへ
      const currentHeight = piece.mesh.position.y;
      piece.mesh.position.y = currentHeight - (currentHeight - targetY) * easeProgress;
      
      // 回転が完了していることを確認
      piece.mesh.rotation.x = Math.PI;
      
      // 下降フェーズの終わり頃（90%以上）で効果音を再生
      if (progress > 0.9 && !piece.soundPlayed) {
        playSound('flip');
        piece.soundPlayed = true;
      }
    } 
    else {
      // アニメーション完了
      piece.mesh.position.y = piece.originalY;
      piece.mesh.rotation.x = 0; // 回転をリセット (0度または180度)
      piece.completed = true;
      
      // アニメーション完了した駒をリストから削除
      flippingPieces.splice(i, 1);
      
      // 全ての駒のアニメーション完了を確認
      if (flippingPieces.length === 0) {
        // 全てのアニメーションが完了したら次のターンへ
        checkGameStateAndProceed();
      }
    }
  }
}

// 追加のイージング関数（より洗練された動きのため）
function easeOutQuint(t) {
  return 1 - Math.pow(1 - t, 5);
}

function easeInQuint(t) {
  return t * t * t * t * t;
}

function easeInOutSine(t) {
  return -(Math.cos(Math.PI * t) - 1) / 2;
}

// 元のイージング関数も保持（他の箇所で使用されている可能性あり）
function easeOutCubic(t) {
  return 1 - Math.pow(1 - t, 3);
}

function easeInCubic(t) {
  return t * t * t;
}

function easeInOutQuad(t) {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

// アニメーションが終わった後、ゲーム状態をチェックして次に進む
function checkGameStateAndProceed() {
  // 処理中フラグをリセット
  isProcessingMove = false;
  
  // すでにゲームが終了していたら何もしない
  if (!gameStarted) return;
  
  // ゲーム終了判定とパス判定
  const gameIsOver = !hasValidMoves(currentPlayer) && !hasValidMoves(-currentPlayer);
  const playerNeedsToPass = !hasValidMoves(currentPlayer) && hasValidMoves(-currentPlayer);
  
  if (gameIsOver) {
    // 両者とも打てない場合は終了
    clearValidMoveMarkers(); // マーカーをクリア
    
    let blackCount = 0, whiteCount = 0;
    
    for (let i = 0; i < 8; i++) {
      for (let j = 0; j < 8; j++) {
        if (boardState[i][j] === 1) blackCount++;
        else if (boardState[i][j] === -1) whiteCount++;
      }
    }
    
    const isWin = blackCount > whiteCount;
    const isDraw = blackCount === whiteCount;
    
    if (isWin) {
      updateGameMessage(`あなたの勝ち！ (${blackCount}-${whiteCount})`);
      playerWins++;
      
      // 勝利時の花火演出
      createFireworks();
    } else if (isDraw) {
      updateGameMessage(`引き分け (${blackCount}-${whiteCount})`);
      draws++;
    } else {
      updateGameMessage(`あなたの負け (${blackCount}-${whiteCount})`);
      cpuWins++;
      
      // 負け効果音
      playSound('lose');
    }
    
    updateStatus();
    // gameStarted = false; // この行を削除し、showGameResultMenu内で設定する
    
    // ゲーム結果メニュー表示
    setTimeout(() => {
      showGameResultMenu(isWin);
    }, 2000);
    
    return; // ゲーム終了時は早期リターン
  }
  
  // 現在のプレイヤーが打てない場合はパス
  if (playerNeedsToPass) {
    if (currentPlayer === 1) {
      // プレイヤーがパス
      clearValidMoveMarkers(); // マーカーをクリア
      updateGameMessage('プレイヤーはパスです。CPUの番です。');
    } else {
      // CPUがパス
      updateGameMessage('CPUはパスです。プレイヤーの番です。');
    }
    
    // 相手のターンに
    currentPlayer = -currentPlayer;
  }
  
  // 次のターンの準備
  if (gameStarted) {
    if (currentPlayer === 1) {
      // プレイヤーのターン
      isPlayerTurn = true;
      showValidMoves(1);
      if (!playerNeedsToPass) {
        updateGameMessage('プレイヤー（黒）の番です');
      }
    } else {
      // CPUのターン
      isPlayerTurn = false;
      if (!playerNeedsToPass) {
        updateGameMessage('CPU（白）の番です');
      }
      setTimeout(makeCPUMove, 100);
    }
  }
}

// -------------------------------
// 有効手の有無とゲーム状態チェック
// -------------------------------
function hasValidMoves(player) {
  for (let i = 0; i < 8; i++) {
    for (let j = 0; j < 8; j++) {
      if (isValidMove(i, j, player)) return true;
    }
  }
  
  return false;
}

// ゲーム結果メニュー表示
function showGameResultMenu(isWin) {
  gameResultMenu = createGameResultMenu(isWin);
  // 盤面の右側に表示する（ステータスボードと被らない位置）
  gameResultMenu.position.set(0.7, 1.0, -0.9); // Z座標を-1.1から-0.9に変更（より手前に）
  gameResultMenu.rotation.y = -Math.PI / 6; // 少し内側に向ける
  scene.add(gameResultMenu);
  
  // ゲーム状態を変更せず、盤面を維持したまま再プレイのオプションを表示
  gameStarted = false;
}

// -------------------------------
// CPUの手（難易度別AI）
// -------------------------------
function makeCPUMove() {
  if (!isPlayerTurn && !isProcessingMove) {
    // 処理中フラグをオン
    isProcessingMove = true;
    
    const validMoves = [];
    
    // 全有効手をリストアップ
    for (let i = 0; i < 8; i++) {
      for (let j =0; j < 8; j++) {
        if (isValidMove(i, j, -1)) {
          // 難易度に応じたスコアリング
          let score = 0;
          
          if (difficultyLevel === 'easy') {
            // 初級：ランダムに近い動き
            score = Math.random() * 10;
          } else if (difficultyLevel === 'medium' || difficultyLevel === 'hard') {
            // 中級以上：位置評価を含む
            
            // 角は非常に価値が高い
            if ((i === 0 || i === 7) && (j === 0 || j === 7)) {
              score += 100;
            }
            
            // 角の隣は危険なので避ける（上級のみ）
            if (difficultyLevel === 'hard') {
              if ((i === 0 || i === 1 || i === 6 || i === 7) && 
                  (j === 0 || j === 1 || j === 6 || j === 7) &&
                  !((i === 0 || i === 7) && (j === 0 || j === 7))) {
                score -= 50;
              }
            }
            
            // 端は比較的安定
            if (i === 0 || i === 7 || j === 0 || j === 7) {
              score += 20;
            }
            
            // ひっくり返せる駒の数も考慮（上級はより重視）
            const flipCount = countFlips(i, j, -1);
            score += difficultyLevel === 'hard' ? flipCount * 2 : flipCount;
            
            // 上級は少しランダム性を減らす
            if (difficultyLevel === 'hard') {
              score += Math.random() * 5;
            } else {
              score += Math.random() * 15;
            }
          }
          
          validMoves.push({ row: i, col: j, score: score });
        }
      }
    }
    
    if (validMoves.length > 0) {
      // CPUの思考エフェクト
      updateGameMessage('CPUが考え中...');
      
      // スコアでソート（高い順）
      validMoves.sort((a, b) => b.score - a.score);
      
      // 難易度に応じた手の選択
      let selectedMove;
      
      if (difficultyLevel === 'easy') {
        const randomIndex = Math.floor(Math.random() * validMoves.length);
        selectedMove = validMoves[randomIndex];
      } else if (difficultyLevel === 'medium') {
        const topMoves = validMoves.slice(0, Math.min(3, validMoves.length));
        const randomIndex = Math.floor(Math.random() * topMoves.length);
        selectedMove = topMoves[randomIndex];
      } else {
        selectedMove = validMoves[0];
      }
      
      const { row, col } = selectedMove;
      
      // 思考エフェクト後に駒を置く（難易度に応じて時間差）
      const thinkTime = difficultyLevel === 'easy' ? 
                      100 + Math.random() * 100 :
                      difficultyLevel === 'medium' ? 
                      200 + Math.random() * 100 :
                      300 + Math.random() * 200;
      
      setTimeout(() => {
        // 駒を置く（アニメーション付き）
        placePiece(row, col, -1, null);
        updateGameMessage(`CPUが (${col+1}, ${row+1}) に置きました。`);
      }, thinkTime);
    } else {
      // 有効な手がない場合はパス処理
      updateGameMessage('CPUはパスです。プレイヤーの番です。');
      currentPlayer = 1;
      isPlayerTurn = true;
      isProcessingMove = false; // 処理完了
      setTimeout(() => {
        showValidMoves(1);
      }, 300);
    }
  }
}

// ひっくり返せる駒の数を数える（AIの評価用）
function countFlips(row, col, player) {
  let count = 0;
  
  const directions = [
    [-1, -1], [-1, 0], [-1, 1],
    [ 0, -1],          [ 0, 1],
    [ 1, -1], [ 1, 0], [ 1, 1]
  ];
  
  for (const [dx, dy] of directions) {
    let flips = 0;
    let x = row + dx, y = col + dy;
    
    while (x >= 0 && x < 8 && y >= 0 && y < 8 && boardState[x][y] === -player) {
      flips++;
      x += dx;
      y += dy;
    }
    
    if (flips > 0 && x >= 0 && x < 8 && y >= 0 && y < 8 && boardState[x][y] === player) {
      count += flips;
    }
  }
  
  return count;
}

// -------------------------------
// コントローラー select イベント
// -------------------------------
function onSelect(event) {
  if (isGripping[0] || isGripping[1]) return;
  
  // 連続した素早いトリガー操作を防止する（デバウンス処理）
  const currentTime = Date.now();
  const cooldownTime = 500; // 500ミリ秒のクールダウン期間
  
  if (currentTime - lastSelectTime < cooldownTime || isProcessingMove) {
    console.log('操作が早すぎます。少し待ってください。');
    return; // クールダウン中は処理をスキップ
  }
  
  lastSelectTime = currentTime;
  
  const controllerIndex = controllers.indexOf(event.target);
  const controller = controllers[controllerIndex];
  const raycaster = new THREE.Raycaster();
  const tempMatrix = new THREE.Matrix4();
  tempMatrix.extractRotation(controller.matrixWorld);
  raycaster.ray.origin.setFromMatrixPosition(controller.matrixWorld);
  raycaster.ray.direction.set(0, 0, -1).applyMatrix4(tempMatrix);
  
  // 難易度選択メニューの処理
  if (difficultyMenu) {
    const menuIntersects = raycaster.intersectObject(difficultyMenu, true);
    
    if (menuIntersects.length > 0) {
      const intersectedObject = getParentWithUserData(menuIntersects[0].object);
      
      if (intersectedObject && intersectedObject.userData) {
        if (intersectedObject.userData.type === 'difficultyButton') {
          // 難易度ボタン選択
          highlightButton(intersectedObject);
        } else if (intersectedObject.userData.type === 'startButton') {
          // スタートボタン押下
          playSound('select');
          initBoard();
          initializeGame();
        }
      }
      return;
    }
  }
  
  // ゲーム結果メニューの処理
  if (gameResultMenu) {
    const resultIntersects = raycaster.intersectObject(gameResultMenu, true);
    
    if (resultIntersects.length > 0) {
      const intersectedObject = getParentWithUserData(resultIntersects[0].object);
      
      if (intersectedObject && intersectedObject.userData) {
        if (intersectedObject.userData.type === 'difficultyMenuButton') {
          // 難易度選択に戻る
          playSound('select');
          scene.remove(gameResultMenu);
          gameResultMenu = null;
          
          // 難易度選択メニューを表示
          difficultyMenu = createDifficultyMenu();
          difficultyMenu.position.set(0, 1.3, -1.1); // -1.3から-1.1に変更（より手前に）
          difficultyMenu.userData.faceCamera = true; // カメラの方向を常に向くように
          scene.add(difficultyMenu);
        } else if (intersectedObject.userData.type === 'rematchButton') {
          // 同じ難易度で再戦
          playSound('select');
          scene.remove(gameResultMenu);
          gameResultMenu = null;
          
          // 新しいゲーム開始（盤面はリセットする）
          initBoard();
          initializeGame();
        }
      }
      return;
    }
  }
  
  // ゲームプレイの処理（ボード上での選択）
  if (board && boardBase && gameStarted && isPlayerTurn && !isProcessingMove) {
    const intersects = raycaster.intersectObject(boardBase);
    
    if (intersects.length > 0) {
      const intersect = intersects[0];
      const localPoint = board.worldToLocal(intersect.point.clone());
      
      let col = Math.floor((localPoint.x + 0.25) / 0.0625);
      let row = Math.floor((localPoint.z + 0.25) / 0.0625);
      
      if (col >= 0 && col < 8 && row >= 0 && row < 8) {
        if (isValidMove(row, col, 1)) {
          console.log('==== 駒を置く処理開始 ====');
          
          // 処理中フラグをオン
          isProcessingMove = true;
          
          // プレイヤーターンを一時的に無効化（駒のアニメーション中に再度置けないようにする）
          isPlayerTurn = false;
          
          // 駒を置く
          placePiece(row, col, 1, controller); // コントローラーオブジェクト自体を渡す
          updateGameMessage(`プレイヤーが (${col+1}, ${row+1}) に置きました。\nCPUの番です。`);
          
          // すべてのアニメーションが完了したらisProcessingMoveフラグは
          // checkGameStateAndProceed関数内でリセットされる
        } else {
          updateGameMessage('そこには置けません。別の場所を選んでください。');
        }
      }
    }
  }
}

// ユーザーデータを持つ親オブジェクトを取得
function getParentWithUserData(object) {
  let current = object;
  
  while (current) {
    if (current.userData && 
        (current.userData.type === 'difficultyButton' || 
         current.userData.type === 'startButton' ||
         current.userData.type === 'difficultyMenuButton' ||
         current.userData.type === 'rematchButton')) {
      return current;
    }
    current = current.parent;
  }
  
  return null;
}

// -------------------------------
// レンダリングループ
// -------------------------------
function renderFrame(time, frame) {
  if (!frame) return;
  
  const deltaTime = 1;
  
  // ステータス表示のアニメーション更新
  updateStatusDisplay(deltaTime);
  
  // 有効手マーカーのアニメーション更新
  updateValidMoveMarkers(deltaTime);
  
  // 駒のフリップアニメーションを更新
  updateFlippingPieces(deltaTime);
  
  // 駒を落とすアニメーションを更新
  updateDroppingPieces(deltaTime);
  
  // フェードインアニメーションの更新
  if (difficultyMenu && difficultyMenu.userData && difficultyMenu.userData.fadeIn) {
    const fadeProgress = difficultyMenu.userData.fadeProgress;
    const fadeSpeed = difficultyMenu.userData.fadeSpeed;
    
    if (fadeProgress < 1) {
      // フェードイン進行中
      difficultyMenu.userData.fadeProgress = Math.min(fadeProgress + fadeSpeed, 1);
      const opacity = easeOutCubic(difficultyMenu.userData.fadeProgress);
      
      // メニューの全要素の透明度を更新
      difficultyMenu.traverse(child => {
        if (child.material && child.material.transparent) {
          if (child.material.opacity !== undefined) {
            // コンポーネントタイプに基づいて目標の不透明度を設定
            let targetOpacity = 0.9; // デフォルト
            
            if (child.userData && child.userData.type === 'startButton') {
              targetOpacity = 0.9;
            } else if (child === difficultyMenu.children[1]) { // フレーム
              targetOpacity = 0.8;
            }
            
            child.material.opacity = opacity * targetOpacity;
          }
        }
      });
    }
  }
  
  // 盤面のフェードインアニメーション更新
  if (board && board.userData && board.userData.fadeIn) {
    const fadeProgress = board.userData.fadeProgress;
    const fadeSpeed = board.userData.fadeSpeed;
    const userData = board.userData;
    
    if (fadeProgress < 1) {
      // フェードイン進行中
      board.userData.fadeProgress = Math.min(fadeProgress + fadeSpeed, 1);
      const progress = easeOutCubic(board.userData.fadeProgress);
      
      // 透明度の更新
      board.traverse(child => {
        if (child.material && child.material.transparent) {
          if (child.material.opacity !== undefined) {
            child.material.opacity = progress;
          }
        }
      });
      
      // 位置の更新（上から降りてくる）
      const currentY = userData.initialY + (userData.targetY - userData.initialY) * progress;
      board.position.y = currentY;
      
      // 回転アニメーション
      userData.rotationProgress += fadeSpeed * 2;
      const rotationAmount = (1 - progress) * Math.PI * 0.1; // 最大10度まで傾く
      board.rotation.x = Math.sin(userData.rotationProgress) * rotationAmount;
      
      // 光るエフェクト
      userData.glowIntensity += 0.05 * userData.glowDirection;
      if (userData.glowIntensity >= 1) {
        userData.glowDirection = -1;
      } else if (userData.glowIntensity <= 0) {
        userData.glowDirection = 1;
      }
      
      // 光るエフェクトの適用
      board.traverse(child => {
        if (child.material) {
          if (child.material.emissive) {
            const baseColor = child.material.color;
            child.material.emissive.setRGB(
              baseColor.r * userData.glowIntensity * 0.3,
              baseColor.g * userData.glowIntensity * 0.3,
              baseColor.b * userData.glowIntensity * 0.3
            );
          }
        }
      });
    } else {
      // アニメーション完了時の処理
      board.rotation.x = 0; // 回転をリセット
      board.position.y = userData.targetY; // 位置を確実に目標位置に
      
      // 光るエフェクトをリセット
      board.traverse(child => {
        if (child.material && child.material.emissive) {
          child.material.emissive.setRGB(0, 0, 0);
        }
      });
      
      board.userData.fadeIn = false;
    }
  }
  
  // パーティクルシステムの更新
  updateParticles(deltaTime);
  
  // グリップ中のボード移動処理
  if ((isGripping[0] || isGripping[1]) && board) {
    const currentControllerPos = new THREE.Vector3();
    const activeController = isGripping[0] ? controllers[0] : controllers[1];
    activeController.getWorldPosition(currentControllerPos);
    const controllerIndex = isGripping[0] ? 0 : 1;
    const delta = new THREE.Vector3().subVectors(currentControllerPos, controllerInitialPositions[controllerIndex]);
    board.position.copy(new THREE.Vector3().addVectors(boardInitialPosition, delta));
  } else if (board && boardBase && gameStarted && isPlayerTurn) {
    // 両方のコントローラーでカーソルを更新
    let cursorVisible = false;
    controllers.forEach((controller, index) => {
      if (!controller) return;
      
      // カーソル更新：盤のベースメッシュを対象にレイキャスト
      const raycaster = new THREE.Raycaster();
      const tempMatrix = new THREE.Matrix4();
      tempMatrix.extractRotation(controller.matrixWorld);
      raycaster.ray.origin.setFromMatrixPosition(controller.matrixWorld);
      raycaster.ray.direction.set(0, 0, -1).applyMatrix4(tempMatrix);
      
      const intersects = raycaster.intersectObject(boardBase);
      
      if (intersects.length > 0) {
        const intersect = intersects[0];
        const localPoint = board.worldToLocal(intersect.point.clone());
        
        let col = Math.floor((localPoint.x + 0.25) / 0.0625);
        let row = Math.floor((localPoint.z + 0.25) / 0.0625);
        
        if (col >= 0 && col < 8 && row >= 0 && row < 8) {
          const cellCenterX = -0.25 + 0.03125 + (col * 0.0625);
          const cellCenterZ = -0.25 + 0.03125 + (row * 0.0625);
          
          // カーソル表示を更新
          if (boardCursor) {
            boardCursor.visible = true;
            cursorVisible = true;
            boardCursor.position.set(cellCenterX, 0.032, cellCenterZ);
            
            // カーソル色：有効なら緑、無効なら赤
            const isValid = isValidMove(row, col, 1);
            const cursorColor = isValid ? 0x00ff00 : 0xff0000;
            
            boardCursor.traverse(child => {
              if (child instanceof THREE.Mesh && child.material.color) {
                child.material.color.setHex(cursorColor);
              } else if (child instanceof THREE.LineSegments && child.material.color) {
                child.material.color.setHex(cursorColor);
              } else if (child instanceof THREE.Points && child.material.color) {
                child.material.color.setHex(cursorColor);
              }
            });
          }
        }
      }
    });

    // どのコントローラーも盤面を指していない場合はカーソルを非表示
    if (!cursorVisible && boardCursor) {
      boardCursor.visible = false;
    }
  } else {
    // プレイヤーターンでないときはカーソルを非表示
    if (boardCursor) {
      boardCursor.visible = false;
    }
  }
  
  // パーティクルとエフェクトの更新
  updateParticles(deltaTime);
  
  // 茶碗の湯気を更新
  if (board) {
    board.traverse((child) => {
      if (child instanceof THREE.Points && child.parent && child.parent.userData && 
          child.userData && child.userData.velocities) {
        updateSteam(child);
      }
    });
  }
  
  // お出迎えパーティクルの更新
  updateWelcomeParticles(deltaTime);
  
  // 難易度選択メニューの更新（マウスオーバー効果など）
  if (difficultyMenu) {
    // メニューを常にプレイヤーの方に向ける
    const cameraPos = new THREE.Vector3();
    camera.getWorldPosition(cameraPos);
    
    const menuPos = new THREE.Vector3();
    difficultyMenu.getWorldPosition(menuPos);
    
    const direction = new THREE.Vector3().subVectors(cameraPos, menuPos);
    direction.y = 0; // Y軸は固定（上下を向かない）
    
    if (direction.length() > 0.001) {
      difficultyMenu.lookAt(cameraPos.x, menuPos.y, cameraPos.z);
    }
  }
  
  // ゲーム結果メニューの更新
  if (gameResultMenu) {
    // メニューを常にプレイヤーの方に向ける
    const cameraPos = new THREE.Vector3();
    camera.getWorldPosition(cameraPos);
    
    const menuPos = new THREE.Vector3();
    gameResultMenu.getWorldPosition(menuPos);
    
    const direction = new THREE.Vector3().subVectors(cameraPos, menuPos);
    direction.y = 0; // Y軸は固定（上下を向かない）
    
    if (direction.length() > 0.001) {
      gameResultMenu.lookAt(cameraPos.x, menuPos.y, cameraPos.z);
    }
  }
  
  renderer.render(scene, camera);
}

// 茶碗の湯気を更新
function updateSteam(steam) {
  const positions = steam.geometry.attributes.position.array;
  const velocities = steam.userData.velocities;
  const lifetimes = steam.userData.lifetime;
  const maxLifetime = steam.userData.maxLifetime;
  
  for (let i = 0; i < positions.length / 3; i++) {
    const i3 = i * 3;
    
    // ライフタイム更新
    lifetimes[i]++;
    if (lifetimes[i] >= maxLifetime) {
      // リセット
      positions[i3] = (Math.random() - 0.5) * 0.015;
      positions[i3 + 1] = 0.01;
      positions[i3 + 2] = (Math.random() - 0.5) * 0.015;
      lifetimes[i] = 0;
      
      // 速度もリセット
      velocities[i] = {
        x: (Math.random() - 0.5) * 0.0005,
        y: Math.random() * 0.001 + 0.0005,
        z: (Math.random() - 0.5) * 0.0005
      };
    } else {
      // 位置を更新
      positions[i3] += velocities[i].x;
      positions[i3 + 1] += velocities[i].y;
      positions[i3 + 2] += velocities[i].z;
      
      // 湯気が薄くなる（高さに応じて）
      const height = positions[i3 + 1];
      const fadeThreshold = 0.02;
      if (height > fadeThreshold) {
        const fadeRatio = (height - fadeThreshold) / 0.02;
        steam.material.opacity = Math.max(0.7 * (1 - fadeRatio), 0);
      }
    }
  }
  
  steam.geometry.attributes.position.needsUpdate = true;
}

// -------------------------------
// 初期化実行
// -------------------------------
init();
initBoard();

// メニューアニメーション更新 - レンダリングループで実行しない
function updateDifficultyMenu(deltaTime) {
  // この関数は使用しないようにします
  return;
}

// 駒を置くアニメーションの定数
const PIECE_DROP_HEIGHT = 0.1; // 駒を落とす高さ
const PIECE_DROP_TIME = 0.6;   // 駒を落とす時間（秒）- より長く
const PIECE_DROP_DELAY = 0.1;  // 駒を落とすまでの遅延（秒）
const PIECE_ARC_HEIGHT = 0.15; // 放物線の高さ

// 駒を落とすアニメーションを更新する関数
function updateDroppingPieces(deltaTime) {
  if (droppingPieces.length === 0) return;
  
  const currentTime = Date.now();
  
  for (let i = droppingPieces.length - 1; i >= 0; i--) {
    const piece = droppingPieces[i];
    const elapsed = currentTime - piece.startTime;
    
    if (elapsed < piece.delay) continue;
    
    const progress = Math.min(1, (elapsed - piece.delay) / piece.duration);
    
    // スケールアニメーション（より小さく始まって大きくなる）
    if (progress < 0.4) {
      if (piece.isCPU) {
        // CPUの場合は少し小さく始まって大きくなる
        piece.scale = 0.8 + (0.2 * (progress / 0.4));
      } else {
        // プレイヤーの場合
        piece.scale = 0.9 + (0.1 * (progress / 0.4));
      }
    } else {
      piece.scale = 1.0;
    }
    piece.mesh.scale.set(piece.scale, piece.scale, piece.scale);
    
    // 位置のアニメーション（放物線の軌道）
    const startPos = piece.startPosition.clone();
    const targetPos = piece.targetPosition.clone();
    
    // 放物線の軌道を計算
    const arcHeight = piece.isCPU ? PIECE_ARC_HEIGHT * 0.8 : PIECE_ARC_HEIGHT; // CPUは少し低め
    
    // イーズイン・イーズアウト・キュービック関数を適用した進行度
    const easeInOutProgress = easeInOutCubic(progress);
    
    // 放物線効果を計算（進行度が0.5で最大高さになる）
    const verticalOffset = Math.sin(easeInOutProgress * Math.PI) * arcHeight;
    
    // 現在位置を補間
    const currentPos = new THREE.Vector3();
    currentPos.lerpVectors(startPos, targetPos, easeInOutProgress);
    
    // 放物線の高さを加える
    currentPos.y += verticalOffset;
    
    // 少しの揺れを加える（進行度に応じた微妙な横揺れ）
    if (progress > 0.1 && progress < 0.9) {
      const wobbleAmount = piece.isCPU ? 0.003 : 0.005; // CPUは少し抑えめの揺れ
      const wobbleFreq = 15; // 揺れの頻度
      const wobbleX = Math.sin(progress * wobbleFreq) * wobbleAmount;
      const wobbleZ = Math.cos(progress * wobbleFreq * 0.7) * wobbleAmount;
      currentPos.x += wobbleX;
      currentPos.z += wobbleZ;
    }
    
    // 位置を適用
    piece.mesh.position.copy(currentPos);
    
    // 駒の回転（進行中に少し回転させる）
    const maxRotation = piece.isCPU ? 0.15 : 0.2; // 最大回転角度（ラジアン）
    const rotationY = Math.sin(progress * Math.PI) * maxRotation;
    piece.mesh.rotation.y = rotationY;
    
    // アニメーション完了
    if (progress >= 1) {
      // スケールと回転を元に戻す
      piece.mesh.scale.set(1, 1, 1);
      piece.mesh.rotation.set(0, 0, 0);
      
      // 効果音を再生
      if (piece.player === 1) {
        playSound('placePlayer');
      } else {
        playSound('placeCPU');
      }
      
      // パーティクル効果
      createPlacementEffect(piece.col, piece.row);
      
      // アニメーション完了フラグ
      piece.completed = true;
      droppingPieces.splice(i, 1);
      
      // ひっくり返すアニメーションのタイミング調整
      if (piece.flippedPieces && piece.flippedPieces.length > 0) {
        // 駒が置かれてから少し待ってからひっくり返し開始
        setTimeout(() => {
          startFlippingSequence(piece.flippedPieces, piece.player);
        }, 100); // 100ms待ってからひっくり返し開始
      } else {
        // ひっくり返す駒がない場合、すぐに次のターンへ
        checkGameStateAndProceed();
      }
    }
  }
}

// イーズイン・イーズアウト・キュービック関数（より自然な動き）
function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

// ひっくり返し処理を順番に開始する関数
function startFlippingSequence(flippedPieces, player) {
  // ひっくり返されても持ち駒は変化しない
  // (持ち駒は盤面に置かれていない駒なので、ひっくり返しでは変わらない)
  
  flippedPieces.forEach((pos, index) => {
    const delay = index * 3; // 各駒のアニメーション開始にディレイを設定
    setTimeout(() => {
      startFlipAnimation(pos[0], pos[1], player);
    }, delay * 15); // ミリ秒に変換
  });
}

// 駒を置くアニメーションを開始する関数
function startPieceDropAnimation(row, col, player, startController, flippedPieces) {
  console.log('==== 駒のアニメーション開始 ====');
  console.log('Player:', player);
  
  // 駒を作成
  const piece = createPiece(col, row, player);
  
  // 影の設定が追加されていることを確認（createPiece内ですでに設定されているはず）
  if (!piece.castShadow) {
    piece.castShadow = true;
    piece.receiveShadow = true;
  }
  
  // 目標位置を計算
  const targetX = -0.25 + 0.03125 + (col * 0.0625);
  const targetZ = -0.25 + 0.03125 + (row * 0.0625);
  
  if (player === 1 && startController) {
    // プレイヤーの場合：コントローラーの先端から駒を出す
    console.log('プレイヤーの駒: コントローラーから');
    
    // コントローラーの先端位置を取得
    const startPosition = new THREE.Vector3();
    startController.getWorldPosition(startPosition);
    
    // コントローラーのローカル空間で先端方向のベクトルを計算
    const direction = new THREE.Vector3(0, 0, -1);
    direction.applyQuaternion(startController.quaternion);
    direction.normalize();
    
    // コントローラー先端の少し前に設定
    startPosition.add(direction.multiplyScalar(0.1));
    
    // ワールド座標からボードのローカル座標に変換
    const startPositionInBoardSpace = board.worldToLocal(startPosition.clone());
    console.log('Start Position In Board Space:', startPositionInBoardSpace);
    
    // 駒の位置を設定
    piece.position.copy(startPositionInBoardSpace);
    
    // プレイヤーの持ち駒を減らす
    decreasePlayerPieces();
  } else {
    // CPUの場合：盤面の奥側から滑らかに移動
    console.log('CPUの駒: 奥側から');
    
    // CPUの持ち駒を減らす
    decreaseCPUPieces();
    
    // 盤面の奥側（プレイヤーから見て）から出現させる
    const cpuStartX = 0; // 盤面の中央X
    const cpuStartY = 0.08; // 少し浮かせる
    const cpuStartZ = -0.35; // 盤の奥側
    
    // ボード座標系における開始位置
    piece.position.set(cpuStartX, cpuStartY, cpuStartZ);
    
    // 少し小さく始める（成長アニメーション用）
    piece.scale.set(0.8, 0.8, 0.8);
  }
  
  // アニメーション情報を設定
  droppingPieces.push({
    mesh: piece,
    startPosition: piece.position.clone(),
    targetPosition: new THREE.Vector3(targetX, 0.035, targetZ),
    startTime: Date.now(),
    duration: PIECE_DROP_TIME * 1000,
    delay: PIECE_DROP_DELAY * 1000,
    player: player,
    scale: player === 1 ? 1.0 : 0.8, // CPUは小さく始める
    row: row,
    col: col,
    flippedPieces: flippedPieces, // ひっくり返す駒の情報を保持
    completed: false,
    // CPUかプレイヤーかの情報も保持
    isCPU: player === -1
  });
}

// -------------------------------
// 持ち駒ケース関連の関数
// -------------------------------

// リッチなケースのテクスチャを作成する関数
function createCaseTexture(baseColor, isMetallic = false) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  
  // 背景色
  ctx.fillStyle = baseColor;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  
  if (isMetallic) {
    // 金属風の光沢
    const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
    gradient.addColorStop(0, 'rgba(255, 255, 255, 0.7)');
    gradient.addColorStop(0.2, 'rgba(255, 255, 255, 0.1)');
    gradient.addColorStop(0.5, 'rgba(255, 255, 255, 0.3)');
    gradient.addColorStop(0.8, 'rgba(255, 255, 255, 0.1)');
    gradient.addColorStop(1, 'rgba(255, 255, 255, 0.5)');
    
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // 細かい光沢のラインを追加
    for (let i = 0; i < 10; i++) {
      const lineWidth = Math.random() * 2 + 1;
      const x = Math.random() * canvas.width;
      
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
      ctx.lineWidth = lineWidth;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x + canvas.width * 0.1, canvas.height);
      ctx.stroke();
    }
  } else {
    // 木目調テクスチャ
    for (let i = 0; i < 20; i++) {
      const y = Math.random() * canvas.height;
      const width = Math.random() * 10 + 5;
      
      ctx.strokeStyle = `rgba(60, 30, 15, ${Math.random() * 0.15 + 0.05})`;
      ctx.lineWidth = width;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.bezierCurveTo(
        canvas.width * 0.3, y + Math.random() * 20 - 10,
        canvas.width * 0.6, y + Math.random() * 20 - 10,
        canvas.width, y + Math.random() * 40 - 20
      );
      ctx.stroke();
    }
  }
  
  // エッジを強調
  ctx.strokeStyle = isMetallic ? 'rgba(255, 255, 255, 0.8)' : 'rgba(30, 15, 5, 0.5)';
  ctx.lineWidth = 8;
  ctx.strokeRect(4, 4, canvas.width - 8, canvas.height - 8);
  
  const texture = new THREE.CanvasTexture(canvas);
  return texture;
}

// 持ち駒ケースを作成する関数
function createPieceCase(isPlayer) {
  const caseGroup = new THREE.Group();
  
  // 盤面と一体化したトレイ部分（細長い溝型）
  const caseWidth = 0.5;  // 盤面と同じ幅
  const caseHeight = 0.02; // 薄くする
  const caseDepth = 0.08;  // 奥行きを小さく
  
  const caseGeometry = new THREE.BoxGeometry(caseWidth, caseHeight, caseDepth);
  
  // プレイヤーとCPUで共通の黒系マテリアル（盤面枠と同系色）
  const caseMaterial = new THREE.MeshStandardMaterial({ 
    color: 0x3d2b1f, 
    roughness: 0.4,
    metalness: 0.3,
  });
  
  const caseBox = new THREE.Mesh(caseGeometry, caseMaterial);
  // 影の設定を追加
  caseBox.castShadow = true;
  caseBox.receiveShadow = true;
  caseGroup.add(caseBox);
  
  // 内側の溝（駒を置く部分）
  const grooveWidth = 0.46; // 少し狭く
  const grooveHeight = 0.005;
  const grooveDepth = 0.06;
  
  const grooveGeometry = new THREE.BoxGeometry(grooveWidth, grooveHeight, grooveDepth);
  const grooveMaterial = new THREE.MeshStandardMaterial({
    color: 0x1a0d00,
    roughness: 0.7,
    metalness: 0.1
  });
  
  const groove = new THREE.Mesh(grooveGeometry, grooveMaterial);
  groove.position.y = 0.008; // 少し上に
  // 影の設定を追加
  groove.castShadow = true;
  groove.receiveShadow = true;
  caseGroup.add(groove);
  
  // ユーザーデータを設定（後で参照するため）
  caseGroup.userData = {
    isPlayerCase: isPlayer,
    type: 'pieceCase'
  };
  
  return caseGroup;
}

// 持ち駒を増減させる関数
function decreasePlayerPieces() {
  if (playerRemainingPieces > 0) {
    playerRemainingPieces--;
    updatePieceCaseDisplay(true);
  }
}

function decreaseCPUPieces() {
  if (cpuRemainingPieces > 0) {
    cpuRemainingPieces--;
    updatePieceCaseDisplay(false);
  }
}

// 持ち駒ケースの表示を更新する関数
function updatePieceCaseDisplay(isPlayer) {
  const pieceCase = isPlayer ? playerPieceCase : cpuPieceCase;
  const remainingPieces = isPlayer ? playerRemainingPieces : cpuRemainingPieces;
  const displayedPieces = isPlayer ? displayedPlayerPieces : displayedCpuPieces;
  
  // 既存の駒をクリア
  while (displayedPieces.length > 0) {
    const pieceToRemove = displayedPieces.pop();
    pieceCase.remove(pieceToRemove);
  }
  
  // 駒の表示数と間隔の設定
  const maxPieces = MAX_PIECES; // 最大32個
  const displayWidth = 0.45;    // トレイの内側幅
  
  // 32個の駒が一列に収まるように間隔を調整
  const spacing = displayWidth / (maxPieces + 1);
  
  // 左端の開始位置
  const startX = -displayWidth / 2 + spacing;
  
  // 駒を配置（プレイヤーは左から減る、CPUは右から減る）
  for (let i = 0; i < remainingPieces; i++) {
    // 盤面の駒と同じサイズで
    const radius = 0.028;  // 盤面と同じ半径
    const height = 0.004;  // 盤面と同じ高さ
    const segments = 32;   // 円周の分割数
    const radiusSegments = 32; // エッジの滑らかさのための分割数
    
    // エッジを丸くした円柱ジオメトリ
    const geometry = new THREE.CylinderGeometry(radius, radius, height, segments);
    
    // プレイヤーとCPUで異なるマテリアル（盤面と同じ）
    const material = isPlayer ?
      new THREE.MeshPhysicalMaterial({
        color: 0x111111,
        metalness: 0.15,  // 0.1から0.15に変更
        roughness: 0.15,  // 0.2から0.15に変更でより艶やかに
        reflectivity: 0.6, // 0.5から0.6に変更
        clearcoat: 0.4,    // 0.3から0.4に変更
        clearcoatRoughness: 0.15 // 0.2から0.15に変更
      }) :
      new THREE.MeshPhysicalMaterial({
        color: 0xf5f5f5,  // より純白に
        metalness: 0.12,  // 0.1から0.12に変更
        roughness: 0.25,  // 0.3から0.25に変更
        reflectivity: 0.8, // 0.7から0.8に変更
        clearcoat: 0.6,    // 0.5から0.6に変更
        clearcoatRoughness: 0.08 // 0.1から0.08に変更
      });
    
    const piece = new THREE.Mesh(geometry, material);
    // 影の設定を追加
    piece.castShadow = true;
    piece.receiveShadow = true;
    
    // 配置位置の計算
    let positionIndex;
    if (isPlayer) {
      // プレイヤーは左から減る（0が一番左、31が一番右）
      positionIndex = i;
    } else {
      // CPUは右から減る（0が一番右、31が一番左）
      positionIndex = maxPieces - remainingPieces + i;
    }
    
    // 実際の位置を計算
    const offsetX = startX + positionIndex * spacing;
    
    // Z方向は中央に配置
    const offsetZ = 0;
    
    // すべての駒を同じ高さに配置
    const offsetY = 0.013;
    
    piece.position.set(offsetX, offsetY, offsetZ);
    
    // 駒を正しく向ける（円柱の側面がプレイヤーを向くように）
    piece.rotation.z = Math.PI / 2;  // Z軸周りに90度回転
    
    pieceCase.add(piece);
    displayedPieces.push(piece);
  }
}

// 持ち駒ケースを初期化する関数
function initPieceCases() {
  // 既存のケースがあれば削除
  if (playerPieceCase) {
    board.remove(playerPieceCase);
  }
  
  if (cpuPieceCase) {
    board.remove(cpuPieceCase);
  }
  
  // 持ち駒数をリセット
  playerRemainingPieces = MAX_PIECES;
  cpuRemainingPieces = MAX_PIECES;
  
  // プレイヤーの持ち駒トレイを作成・配置
  playerPieceCase = createPieceCase(true);
  playerPieceCase.position.set(0, 0.01, 0.3); // 盤面の手前端に接するように
  playerPieceCase.rotation.y = 0; // まっすぐ配置
  board.add(playerPieceCase);
  
  // CPUの持ち駒トレイを作成・配置
  cpuPieceCase = createPieceCase(false);
  cpuPieceCase.position.set(0, 0.01, -0.3); // 盤面の奥側端に接するように
  cpuPieceCase.rotation.y = 0; // まっすぐ配置
  board.add(cpuPieceCase);
  
  // 表示を初期化
  displayedPlayerPieces = [];
  displayedCpuPieces = [];
  
  // 持ち駒の表示を更新
  updatePieceCaseDisplay(true);
  updatePieceCaseDisplay(false);
}

// ページ読み込み時に初期化を呼び出し
init();

// 花火の音再生関数
function playFireworkSound() {
  if (!listener || !listener.context) {
    console.warn('Audio listener not initialized');
    return;
  }
  
  // 花火音を切るタイマーを設定（10秒後に停止）
  if (window.fireworkSoundTimeout) {
    clearTimeout(window.fireworkSoundTimeout);
  }
  
  window.fireworkSoundTimeout = setTimeout(() => {
    if (window.fireworksActive) {
      // 10秒後に音を止めるが、花火は継続
      console.log('花火音を停止しますが、視覚効果は継続します');
    }
  }, 10000); // 10秒後に音を止める
}

// ランダムな花火の音を再生
function playRandomFireworkSound() {
  if (!listener || !listener.context || !window.fireworksActive) return;
  
  // 花火の音が停止状態なら何もしない（10秒のタイムアウト後）
  if (!window.fireworkSoundTimeout) return;
  
  const context = listener.context;
  
  // 各種花火音のバリエーション
  const soundType = Math.floor(Math.random() * 3);
  const volume = 0.15; // 音量を控えめに
  
  // ゲインノード
  const gainNode = context.createGain();
  gainNode.connect(context.destination);
  gainNode.gain.value = volume;
  
  // ノイズ発生器（ホワイトノイズ）
  const bufferSize = context.sampleRate * 0.5; // 0.5秒分
  const buffer = context.createBuffer(1, bufferSize, context.sampleRate);
  const data = buffer.getChannelData(0);
  
  // ノイズ生成
  for (let i = 0; i < bufferSize; i++) {
    data[i] = Math.random() * 2 - 1;
  }
  
  // ノイズソース
  const noise = context.createBufferSource();
  noise.buffer = buffer;
  
  // フィルター
  const filter = context.createBiquadFilter();
  filter.type = 'bandpass';
  
  switch (soundType) {
    case 0: // 打ち上げ音
      filter.frequency.value = 500;
      filter.Q.value = 1;
      
      // 音量エンベロープ
      gainNode.gain.setValueAtTime(0, context.currentTime);
      gainNode.gain.linearRampToValueAtTime(volume, context.currentTime + 0.05);
      gainNode.gain.exponentialRampToValueAtTime(0.01, context.currentTime + 0.3);
      
      // 再生時間
      noise.start();
      noise.stop(context.currentTime + 0.3);
      break;
      
    case 1: // 爆発音（短め）
      filter.frequency.value = 800;
      filter.Q.value = 0.7;
      
      // 音量エンベロープ
      gainNode.gain.setValueAtTime(0, context.currentTime);
      gainNode.gain.linearRampToValueAtTime(volume, context.currentTime + 0.01);
      gainNode.gain.exponentialRampToValueAtTime(0.01, context.currentTime + 0.2);
      
      // 再生時間
      noise.start();
      noise.stop(context.currentTime + 0.2);
      break;
      
    case 2: // 大きな爆発音
      filter.frequency.value = 300;
      filter.Q.value = 0.5;
      
      // 音量エンベロープ
      gainNode.gain.setValueAtTime(0, context.currentTime);
      gainNode.gain.linearRampToValueAtTime(volume, context.currentTime + 0.02);
      gainNode.gain.exponentialRampToValueAtTime(0.01, context.currentTime + 0.5);
      
      // 再生時間
      noise.start();
      noise.stop(context.currentTime + 0.5);
      break;
  }
  
  // 接続
  noise.connect(filter);
  filter.connect(gainNode);
}