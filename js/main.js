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
let handModels = []; // ハンドモデル用の配列
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
let exitButton; // WebXR終了ボタン
let bgm; // BGMオーディオオブジェクト

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

// -------------------------------
// 効果音の再生（バリエーション付き）
// -------------------------------
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

// -------------------------------
// ハンドモデルを作成する関数
// -------------------------------
function createHandModel(handedness) {
  const hand = new THREE.Group();
  hand.userData = {
    handedness: handedness,
    visible: false
  };
  return hand;
}

// -------------------------------
// ハンドモデルを更新する関数
// -------------------------------
function updateHandModels(frame) {
  // 基本的な実装（詳細は後で実装）
  return false;
}

// -------------------------------
// システムジェスチャーを検出する関数
// -------------------------------
function detectSystemGesture(frame) {
  // 基本的な実装（詳細は後で実装）
  return false;
}

// -------------------------------
// WebXRセッションを開始する関数
// -------------------------------
async function startXRSession() {
  if (!navigator.xr) {
    alert('WebXRはお使いのブラウザでサポートしていません。');
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
      optionalFeatures: ['dom-overlay', 'hand-tracking'],
      domOverlay: { root: document.body }
    });
    
    xrSession.addEventListener('end', () => {
      xrSession = null;
      document.getElementById('menuUI').style.display = 'flex';
      if (loadingUI) loadingUI.style.display = 'none';
      
      // BGM停止
      if (bgm && bgm.isPlaying) {
        bgm.stop();
      }
    });
    
    // ヘッドセットの可視性変更イベントリスナーを追加
    xrSession.addEventListener('visibilitychange', (event) => {
      if (xrSession.visibilityState === 'visible') {
        // 可視状態に戻ったらBGMを再開
        if (bgm && !bgm.isPlaying && soundEnabled) {
          bgm.play();
        }
      } else if (xrSession.visibilityState === 'hidden') {
        // 非表示になったらBGMを一時停止
        if (bgm && bgm.isPlaying) {
          bgm.pause();
        }
      }
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
    
    // ハンドモデルの設定
    handModels = [
      createHandModel('left'),
      createHandModel('right')
    ];
    
    // ハンドモデルをシーンに追加
    handModels.forEach(handModel => {
      scene.add(handModel);
    });

    xrReferenceSpace = await xrSession.requestReferenceSpace('local-floor');
    const viewerSpace = await xrSession.requestReferenceSpace('viewer');
    xrHitTestSource = await xrSession.requestHitTestSource({ space: viewerSpace });

    renderer.setAnimationLoop(renderFrame);
    
    // 音声の初期化
    initSounds();
    
    // BGMを再生するコード
    const audioLoader = new THREE.AudioLoader();
    bgm = new THREE.Audio(listener);
    audioLoader.load('assets/sounds/osero.mp3', function(buffer) {
      bgm.setBuffer(buffer);
      bgm.setLoop(true);
      bgm.setVolume(0.2); // 音量を0.3から0.2に下げる
      bgm.play();
    });
    
    // WebXR終了ボタンを作成してシーンに追加
    exitButton = createExitButton();
    scene.add(exitButton);
    
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
// WebXRセッションが終了したときの処理
// -------------------------------
function onXRSessionEnded() {
  // セッションのイベントリスナーを解除
  xrSession.removeEventListener('end', onXRSessionEnded);
  xrSession.removeEventListener('select', onSelect);
  
  // コントローラーのイベントリスナーを解除
  controllers.forEach(controller => {
    controller.removeEventListener('selectstart', onSelectStart);
    controller.removeEventListener('selectend', onSelectEnd);
    controller.removeEventListener('connected', onControllerConnected);
    controller.removeEventListener('disconnected', onControllerDisconnected);
  });
  
  // アニメーションループの停止
  renderer.setAnimationLoop(null);
  
  // セッションの終了
  xrSession = null;
  xrReferenceSpace = null;
  xrHitTestSource = null;
  
  // コントローラーとハンドモデルをシーンから削除
  controllers.forEach(controller => {
    scene.remove(controller);
  });
  
  handModels.forEach(handModel => {
    scene.remove(handModel);
  });
  
  // コントローラーとハンドモデルの配列をクリア
  controllers = [];
  handModels = [];
}

// -------------------------------
// コントローラーが接続されたときの処理
// -------------------------------
function onControllerConnected(event) {
  // コントローラーのモデルを作成
  const controllerModel = renderer.xr.getControllerModel(event.data);
  if (controllerModel) {
    event.target.add(controllerModel.clone());
  }
}

// -------------------------------
// コントローラーが切断されたときの処理
// -------------------------------
function onControllerDisconnected(event) {
  // コントローラーのモデルを削除
  while (event.target.children.length > 0) {
    event.target.remove(event.target.children[0]);
  }
}

// -------------------------------
// コントローラーのセレクト開始時の処理
// -------------------------------
function onSelectStart(event) {
  // グリップ操作の開始
  const controller = event.target;
  const index = controllers.indexOf(controller);
  if (index !== -1) {
    isGripping[index] = true;
    controllerInitialPositions[index].copy(controller.position);
    boardInitialPosition.copy(board.position);
  }
}

// -------------------------------
// コントローラーのセレクト終了時の処理
// -------------------------------
function onSelectEnd(event) {
  // グリップ操作の終了
  const controller = event.target;
  const index = controllers.indexOf(controller);
  if (index !== -1) {
    isGripping[index] = false;
  }
}

// -------------------------------
// セレクトイベントの処理
// -------------------------------
function onSelect(event) {
  // セレクトイベントの処理
  const controller = event.target;
  const index = controllers.indexOf(controller);
  if (index !== -1) {
    // セレクトイベントの処理
    handleSelectEvent(index);
  }
}

// -------------------------------
// セレクトイベントの処理
// -------------------------------
function handleSelectEvent(controllerIndex) {
  // セレクトイベントの処理
  if (isProcessingMove) return;
  
  // 最後のselectイベントからの経過時間を計算
  const currentTime = performance.now();
  const timeSinceLastSelect = currentTime - lastSelectTime;
  lastSelectTime = currentTime;
  
  // 連続したselectイベントの間隔が短すぎる場合は無視
  if (timeSinceLastSelect < 500) return;
  
  // ゲームが開始されていない場合は無視
  if (!gameStarted) return;
  
  // 難易度が選択されていない場合は無視
  if (!difficultySelected) return;
  
  // プレイヤーのターンでない場合は無視
  if (!isPlayerTurn) return;
  
  // コントローラーの位置を取得
  const controller = controllers[controllerIndex];
  const controllerPos = new THREE.Vector3();
  controller.getWorldPosition(controllerPos);
  
  // オセロ盤の位置を取得
  const boardPos = new THREE.Vector3();
  board.getWorldPosition(boardPos);
  
  // コントローラーの位置をオセロ盤のローカル座標系に変換
  const localControllerPos = controllerPos.clone().sub(boardPos);
  
  // オセロ盤のセルに対応する行と列を計算
  const cellSize = 0.0625;
  const row = Math.floor((localControllerPos.z + 0.25) / cellSize);
  const col = Math.floor((localControllerPos.x + 0.25) / cellSize);
  
  // 有効なセルかどうかをチェック
  if (row >= 0 && row < 8 && col >= 0 && col < 8) {
    // 有効なセルの場合、駒を置く処理を開始
    placePiece(row, col);
  }
}

// -------------------------------
// 駒を置く処理
// -------------------------------
function placePiece(row, col) {
  // 駒を置く処理
  if (isProcessingMove) return;
  
  // 有効なセルかどうかをチェック
  if (!isValidMove(row, col, currentPlayer)) return;
  
  // 駒を置く処理中フラグを立てる
  isProcessingMove = true;
  
  // 駒を置くアニメーションを開始
  animatePiecePlacement(row, col);
}

// -------------------------------
// 駒を置くアニメーション
// -------------------------------
function animatePiecePlacement(row, col) {
  // 駒を置くアニメーション
  const piece = createPiece(currentPlayer);
  piece.position.set(0, 0.035, 0);
  piece.rotation.x = -Math.PI / 2;
  piece.userData = {
    row: row,
    col: col,
    animationPhase: 0,
    animationDuration: 0.5,
    startTime: performance.now()
  };
  board.add(piece);
  pieces.push(piece);
  
  // 駒を落とすアニメーションを開始
  animatePieceDrop(piece);
}

// -------------------------------
// 駒を落とすアニメーション
// -------------------------------
function animatePieceDrop(piece) {
  // 駒を落とすアニメーション
  const dropDuration = 0.5;
  const dropHeight = 0.2;
  const dropStartTime = performance.now();
  
  const dropAnimation = () => {
    const currentTime = performance.now();
    const elapsedTime = (currentTime - dropStartTime) / 1000;
    const progress = Math.min(elapsedTime / dropDuration, 1);
    
    // 駒を上から落とすアニメーション
    const y = dropHeight * (1 - progress);
    piece.position.y = y;
    
    if (progress < 1) {
      requestAnimationFrame(dropAnimation);
    } else {
      // 落下アニメーションが終了したら、駒を置く処理を完了
      completePiecePlacement(piece);
    }
  };
  
  dropAnimation();
}

// -------------------------------
// 駒を置く処理を完了
// -------------------------------
function completePiecePlacement(piece) {
  // 駒を置く処理を完了
  const row = piece.userData.row;
  const col = piece.userData.col;
  
  // 盤面の状態を更新
  boardState[row][col] = currentPlayer;
  
  // 駒を置いたセルの周囲の駒をひっくり返す
  flipPieces(row, col);
  
  // 駒を置く処理中フラグを解除
  isProcessingMove = false;
  
  // プレイヤーのターンを終了
  endPlayerTurn();
}

// -------------------------------
// 駒をひっくり返すアニメーション
// -------------------------------
function flipPieces(row, col) {
  // 駒をひっくり返すアニメーション
  const directions = [
    { dx: -1, dy: 0 }, // 左
    { dx: 1, dy: 0 }, // 右
    { dx: 0, dy: -1 }, // 上
    { dx: 0, dy: 1 }, // 下
    { dx: -1, dy: -1 }, // 左上
    { dx: 1, dy: -1 }, // 右上
    { dx: -1, dy: 1 }, // 左下
    { dx: 1, dy: 1 } // 右下
  ];
  
  directions.forEach(direction => {
    const dx = direction.dx;
    const dy = direction.dy;
    let x = row + dx;
    let y = col + dy;
    
    while (x >= 0 && x < 8 && y >= 0 && y < 8) {
      if (boardState[x][y] === -currentPlayer) {
        boardState[x][y] = currentPlayer;
        x += dx;
        y += dy;
      } else if (boardState[x][y] === currentPlayer) {
        break;
      } else {
        break;
      }
    }
  });
}

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

function renderFrame(time, frame) {
  time *= 0.001; // ミリ秒を秒に変換
  const deltaTime = Math.min(0.05, clock.getDelta()) * DELTA_MULTIPLIER; // デルタ時間

  if (frame) {
    if (xrSession) {
      // ハンドモデルの更新
      updateHandModels(frame);
      
      // システムジェスチャーの検出
      if (detectSystemGesture(frame)) {
        if (xrSession) {
          xrSession.end();
        }
      }
      
      // WebXR終了ボタンの更新
      if (exitButton) {
        updateExitButton(frame);
      }
      
      const referenceSpace = xrReferenceSpace;
      if (xrHitTestSource && !gameStarted) {
        // ヒットテスト
        const hitTestResults = frame.getHitTestResults(xrHitTestSource);
        if (hitTestResults.length) {
          const hit = hitTestResults[0];
          const pose = hit.getPose(referenceSpace);
          
          if (!difficultySelected) {
            // 難易度選択前は難易度メニューを表示
            if (difficultyMenu) {
              difficultyMenu.visible = true;
              // ユーザーの前に配置
              difficultyMenu.position.set(pose.transform.position.x, pose.transform.position.y + 0.2, pose.transform.position.z);
            }
          } else if (!gameStarted) {
            // 難易度選択後かつゲーム開始前ならオセロ盤を配置
            if (board) {
              board.visible = true;
              board.position.set(pose.transform.position.x, pose.transform.position.y + 0.5, pose.transform.position.z);
              
              // 持ち駒ケースも一緒に移動
              if (playerPieceCase && cpuPieceCase) {
                playerPieceCase.position.set(
                  pose.transform.position.x - 0.2, 
                  pose.transform.position.y + 0.45, 
                  pose.transform.position.z + 0.3
                );
                
                cpuPieceCase.position.set(
                  pose.transform.position.x + 0.2, 
                  pose.transform.position.y + 0.45, 
                  pose.transform.position.z - 0.3
                );
                
                playerPieceCase.visible = true;
                cpuPieceCase.visible = true;
              }
              
              // ステータス表示も配置
              if (statusDisplay) {
                statusDisplay.visible = true;
                statusDisplay.position.set(
                  pose.transform.position.x, 
                  pose.transform.position.y + 0.75, 
                  pose.transform.position.z
                );
              }
              
              gameStarted = true;
              placePiece(3, 4, 1); // 初期配置：黒
              placePiece(4, 3, 1); // 初期配置：黒
              placePiece(3, 3, -1); // 初期配置：白
              placePiece(4, 4, -1); // 初期配置：白
              
              showValidMoves(currentPlayer);
              
              // CPU残り駒と黒駒のカウント更新
              playerRemainingPieces = MAX_PIECES - 2;
              cpuRemainingPieces = MAX_PIECES - 2;
              updatePieceCaseDisplay(true);
              updatePieceCaseDisplay(false);
              
              // 音を鳴らす
              playSound('start');
              createParticleSystem();
              
              // 初回メッセージ
              updateGameMessage('あなたの番です（黒）');
            }
          }
        }
      }
      
      // ゲーム開始後のみ実行
      if (gameStarted) {
        // フリップアニメーション更新
        if (flippingPieces.length > 0) {
          updateFlippingPieces(deltaTime);
        }
        
        // 駒落下アニメーション更新
        if (droppingPieces.length > 0) {
          updateDroppingPieces(deltaTime);
        }
        
        if (board) {
          // チェス盤のカーソル位置更新
          let found = false;
          
          // 両方のコントローラーでカーソルを更新
          controllers.forEach(controller => {
            // コントローラー用のレイキャスト
            const tempMatrix = new THREE.Matrix4();
            tempMatrix.identity().extractRotation(controller.matrixWorld);
            
            const raycaster = new THREE.Raycaster();
            raycaster.ray.origin.setFromMatrixPosition(controller.matrixWorld);
            raycaster.ray.direction.set(0, 0, -1).applyMatrix4(tempMatrix);
            
            // ボードベースとの衝突判定
            if (boardBase) {
              const intersects = raycaster.intersectObject(boardBase);
              
              if (intersects.length > 0) {
                // 衝突したらその位置をカーソル位置に設定
                const point = intersects[0].point;
                
                // ボードのローカル座標系に変換
                const localPoint = board.worldToLocal(point.clone());
                
                // ボードのローカル座標を盤の列と行に変換
                const col = Math.floor((localPoint.x + 0.25) / 0.0625);
                const row = Math.floor((localPoint.z + 0.25) / 0.0625);
                
                // 有効範囲内かチェック
                if (row >= 0 && row < 8 && col >= 0 && col < 8) {
                  if (boardCursor) {
                    // カーソル位置を更新
                    const boardX = -0.25 + 0.03125 + (col * 0.0625);
                    const boardZ = -0.25 + 0.03125 + (row * 0.0625);
                    
                    boardCursor.position.set(boardX, 0.002, boardZ);
                    boardCursor.visible = true;
                    boardCursor.userData.row = row;
                    boardCursor.userData.col = col;
                    found = true;
                    
                    // 有効な場所かどうか色変更
                    if (isPlayerTurn && isValidMove(row, col, currentPlayer)) {
                      boardCursor.material.color.set(0x00ff00); // 緑色
                    } else {
                      boardCursor.material.color.set(0xff0000); // 赤色
                    }
                  }
                }
              }
            }
          });
          
          // どのコントローラーも盤面を指していない場合はカーソルを非表示
          if (!found && boardCursor) {
            boardCursor.visible = false;
          }
        }
      }
    }
  }
  
  // 時間経過に基づくアニメーション
  updateParticles(deltaTime); // パーティクル更新
  
  // ウェルカムパーティクル更新
  if (welcomeParticles.length > 0) {
    updateWelcomeParticles(deltaTime);
  }
  
  // 花火エフェクト更新
  if (fireworks.length > 0) {
    fireworks.forEach((firework, index) => {
      firework.update(deltaTime);
      
      if (firework.isDead()) {
        scene.remove(firework.system);
        fireworks.splice(index, 1);
      }
    });
  }
  
  // 有効手マーカーの更新
  updateValidMoveMarkers(deltaTime);
  
  // 状態表示の更新
  if (statusDisplay) {
    updateStatusDisplay(deltaTime);
  }
  
  // 難易度メニューの更新
  if (difficultyMenu && !difficultySelected) {
    updateDifficultyMenu(deltaTime);
  }
  
  renderer.render(scene, camera);
}