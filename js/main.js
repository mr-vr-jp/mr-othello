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
let particles = [];    // パーティクル効果用
let fireworks = [];    // 花火効果用
let soundEnabled = true; // 音声有効フラグ
let listener; // 音声リスナー
let sounds = {}; // 音声オブジェクト格納用
let welcomeParticles = []; // お出迎えパーティクル用
let lastSelectTime = 0; // 最後にselectイベントが発生した時間を保持
let isProcessingMove = false; // 駒を置く処理中かどうかのフラグ
let exitButton; // WebXR終了ボタン
let bgm; // BGMオーディオオブジェクト
let clock = new THREE.Clock(); // deltaTime計算用のクロック変数

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
  // WebXR終了ボタンの押下判定
  if (exitButton && exitButton.userData.hovering) {
    playSound('select');
    if (xrSession) {
      xrSession.end();
    }
    return;
  }
  
  // 難易度選択メニューの操作
  if (difficultyMenu && !difficultySelected) {
    const controller = event.target;
    const raycaster = new THREE.Raycaster();
    const tempMatrix = new THREE.Matrix4();
    tempMatrix.identity().extractRotation(controller.matrixWorld);
    raycaster.ray.origin.setFromMatrixPosition(controller.matrixWorld);
    raycaster.ray.direction.set(0, 0, -1).applyMatrix4(tempMatrix);
    
    // 難易度ボタンとの交差判定
    difficultyMenu.children.forEach(child => {
      if (child.userData && child.userData.type === 'button') {
        const intersects = raycaster.intersectObject(child);
        
        if (intersects.length > 0) {
          // 難易度が選択された
          difficultyLevel = child.userData.value;
          difficultySelected = true;
          scene.remove(difficultyMenu);
          playSound('select');
          
          // 難易度に応じた設定を行う
          setupGame();
          return;
        }
      }
    });
  }
  
  // ゲーム内の操作（駒を置く）
  if (gameStarted && isPlayerTurn && !isProcessingMove) {
    // 最後のselectイベントからの経過時間を計算
    const currentTime = performance.now();
    const timeSinceLastSelect = currentTime - lastSelectTime;
    
    // 連続したselectイベントの間隔が短すぎる場合は無視
    if (timeSinceLastSelect < 500) {
      return;
    }
    
    lastSelectTime = currentTime;
    
    // コントローラーを使ってボード上の位置を特定
    const controller = event.target;
    const raycaster = new THREE.Raycaster();
    const tempMatrix = new THREE.Matrix4();
    tempMatrix.identity().extractRotation(controller.matrixWorld);
    raycaster.ray.origin.setFromMatrixPosition(controller.matrixWorld);
    raycaster.ray.direction.set(0, 0, -1).applyMatrix4(tempMatrix);
    
    // ボードとの交差判定
    if (boardBase) {
      const intersects = raycaster.intersectObject(boardBase);
      
      if (intersects.length > 0) {
        // 交差点の位置をボードの座標系に変換
        const point = intersects[0].point;
        const localPoint = board.worldToLocal(point.clone());
        
        // ボードの座標を行と列に変換
        const col = Math.floor((localPoint.x + 0.25) / 0.0625);
        const row = Math.floor((localPoint.z + 0.25) / 0.0625);
        
        // 有効範囲内かつ有効な手かどうかをチェック
        if (row >= 0 && row < 8 && col >= 0 && col < 8 && isValidMove(row, col, currentPlayer)) {
          // 駒を置く
          placePiece(row, col, currentPlayer, controller);
          
          // プレイヤーのターン終了
          endPlayerTurn();
        }
      }
    }
  }
}

// -------------------------------
// プレイヤーのターン終了処理
// -------------------------------
function endPlayerTurn() {
  isPlayerTurn = false;
  
  // 有効手マーカーをクリア
  clearValidMoveMarkers();
  
  // ゲーム状態の更新
  updateGameState();
  
  // CPUのターンを開始
  setTimeout(() => {
    if (!isPlayerTurn) {
      startCPUTurn();
    }
  }, 1000);
}

// -------------------------------
// ゲーム状態の更新
// -------------------------------
function updateGameState() {
  // ゲーム終了判定
  const blackCount = countPieces(1);
  const whiteCount = countPieces(-1);
  const emptyCount = 64 - blackCount - whiteCount;
  
  if (emptyCount === 0) {
    // 盤面が埋まった場合
    gameOver(blackCount, whiteCount);
  } else {
    // 次のプレイヤーが打てるかチェック
    const nextPlayer = -currentPlayer;
    const canNextPlayerMove = checkPlayerCanMove(nextPlayer);
    
    if (!canNextPlayerMove) {
      // 次のプレイヤーが打てない場合
      const canCurrentPlayerMove = checkPlayerCanMove(currentPlayer);
      
      if (!canCurrentPlayerMove) {
        // 両者とも打てない場合はゲーム終了
        gameOver(blackCount, whiteCount);
      } else {
        // 現在のプレイヤーがそのまま続行
        currentPlayer = currentPlayer;
        isPlayerTurn = currentPlayer === 1;
        
        if (isPlayerTurn) {
          updateGameMessage('相手の打てる場所がないため、あなたの番が続きます');
          showValidMoves(currentPlayer);
        } else {
          updateGameMessage('あなたの打てる場所がないため、相手の番が続きます');
          startCPUTurn();
        }
      }
    } else {
      // 通常の交代
      currentPlayer = nextPlayer;
      isPlayerTurn = currentPlayer === 1;
      
      if (isPlayerTurn) {
        updateGameMessage('あなたの番です（黒）');
        showValidMoves(currentPlayer);
      } else {
        updateGameMessage('相手の番です（白）');
      }
    }
  }
}

// -------------------------------
// 駒の数を数える関数
// -------------------------------
function countPieces(player) {
  let count = 0;
  
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      if (boardState[row][col] === player) {
        count++;
      }
    }
  }
  
  return count;
}

// -------------------------------
// プレイヤーが駒を置ける場所があるかチェックする関数
// -------------------------------
function checkPlayerCanMove(player) {
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      if (isValidMove(row, col, player)) {
        return true;
      }
    }
  }
  
  return false;
}

// -------------------------------
// ゲーム終了処理
// -------------------------------
function gameOver(blackCount, whiteCount) {
  // ゲーム結果の表示
  let resultMessage;
  
  if (blackCount > whiteCount) {
    resultMessage = `あなたの勝ち！ ${blackCount}-${whiteCount}`;
    playerWins++;
    playSound('win');
  } else if (whiteCount > blackCount) {
    resultMessage = `あなたの負け ${blackCount}-${whiteCount}`;
    cpuWins++;
    playSound('lose');
  } else {
    resultMessage = `引き分け ${blackCount}-${whiteCount}`;
    draws++;
  }
  
  updateGameMessage(resultMessage);
  
  // ゲーム再開のためのリセット
  setTimeout(() => {
    resetGame();
  }, 5000);
}

// -------------------------------
// ゲームのリセット
// -------------------------------
function resetGame() {
  // ボード状態をリセット
  initBoardState();
  
  // 駒をクリア
  while (pieces.length > 0) {
    const piece = pieces.pop();
    board.remove(piece);
  }
  
  // ゲーム状態をリセット
  currentPlayer = 1;
  isPlayerTurn = true;
  gameStarted = true;
  
  // 初期配置
  placePiece(3, 4, 1);
  placePiece(4, 3, 1);
  placePiece(3, 3, -1);
  placePiece(4, 4, -1);
  
  // 持ち駒をリセット
  playerRemainingPieces = MAX_PIECES - 2;
  cpuRemainingPieces = MAX_PIECES - 2;
  updatePieceCaseDisplay(true);
  updatePieceCaseDisplay(false);
  
  // 有効手を表示
  showValidMoves(currentPlayer);
  
  // メッセージを更新
  updateGameMessage('あなたの番です（黒）');
}

// -------------------------------
// CPUのターン開始
// -------------------------------
function startCPUTurn() {
  if (isPlayerTurn) return;
  
  // 簡単なAIによる手の選択
  setTimeout(() => {
    const move = selectCPUMove();
    
    if (move) {
      placePiece(move.row, move.col, -1);
      
      // CPUのターン終了
      endCPUTurn();
    } else {
      // 打てる場所がない場合
      updateGameMessage('CPUの打てる場所がありません');
      
      // プレイヤーのターンに戻る
      endCPUTurn();
    }
  }, 1500);
}

// -------------------------------
// CPUのターン終了
// -------------------------------
function endCPUTurn() {
  isPlayerTurn = true;
  
  // ゲーム状態の更新
  updateGameState();
}

// -------------------------------
// CPUの手を選択する関数
// -------------------------------
function selectCPUMove() {
  // 有効な手を集める
  const validMoves = [];
  
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      if (isValidMove(row, col, -1)) {
        validMoves.push({ row, col });
      }
    }
  }
  
  if (validMoves.length === 0) {
    return null;
  }
  
  // 難易度に応じた手の選択
  if (difficultyLevel === 'easy') {
    // 簡単：ランダムに選択
    return validMoves[Math.floor(Math.random() * validMoves.length)];
  } else if (difficultyLevel === 'hard') {
    // 難しい：評価関数に基づいて選択
    return getBestMove(validMoves);
  } else {
    // 中級：80%の確率で最適な手、20%の確率でランダム
    if (Math.random() < 0.8) {
      return getBestMove(validMoves);
    } else {
      return validMoves[Math.floor(Math.random() * validMoves.length)];
    }
  }
}

// -------------------------------
// 最適な手を選択する関数
// -------------------------------
function getBestMove(validMoves) {
  // 簡易的な評価関数：隅を優先
  const corners = [
    {row: 0, col: 0},
    {row: 0, col: 7},
    {row: 7, col: 0},
    {row: 7, col: 7}
  ];
  
  // 隅に置ける場合は置く
  for (const move of validMoves) {
    for (const corner of corners) {
      if (move.row === corner.row && move.col === corner.col) {
        return move;
      }
    }
  }
  
  // 端の方が良い
  const edgeMoves = validMoves.filter(move => 
    move.row === 0 || move.row === 7 || move.col === 0 || move.col === 7
  );
  
  if (edgeMoves.length > 0) {
    return edgeMoves[Math.floor(Math.random() * edgeMoves.length)];
  }
  
  // それ以外はランダム
  return validMoves[Math.floor(Math.random() * validMoves.length)];
}

// -------------------------------
// ゲームのセットアップ
// -------------------------------
function setupGame() {
  // オセロ盤を表示
  board.visible = true;
  
  // ゲーム状態の初期化
  initBoardState();
  
  // 駒をクリア
  while (pieces.length > 0) {
    const piece = pieces.pop();
    board.remove(piece);
  }
  
  // ゲーム状態をリセット
  currentPlayer = 1;
  isPlayerTurn = true;
  gameStarted = false; // まだHitTestで配置する必要あり
}

// -------------------------------
// コントローラーのsqueezestart（グリップ）イベント処理関数
// -------------------------------
function onSqueezeStart(event) {
  const controller = event.target;
  const index = controllers.indexOf(controller);
  
  if (index !== -1) {
    isGripping[index] = true;
    
    // コントローラーの初期位置を保存
    controllerInitialPositions[index].copy(controller.position);
    
    // ボードの初期位置を保存
    if (board) {
      boardInitialPosition.copy(board.position);
    }
  }
}

// -------------------------------
// コントローラーのsqueezeend（グリップ解除）イベント処理関数
// -------------------------------
function onSqueezeEnd(event) {
  const controller = event.target;
  const index = controllers.indexOf(controller);
  
  if (index !== -1) {
    isGripping[index] = false;
  }
}

// -------------------------------
// グリップ操作によるボードの移動処理
// -------------------------------
function updateBoardPosition() {
  if (!board || !gameStarted) return;
  
  let isAnyGripping = false;
  
  controllers.forEach((controller, index) => {
    if (isGripping[index]) {
      isAnyGripping = true;
      
      // コントローラーの移動量を計算
      const currentPosition = new THREE.Vector3();
      controller.getWorldPosition(currentPosition);
      
      const delta = new THREE.Vector3().subVectors(
        currentPosition,
        controllerInitialPositions[index]
      );
      
      // ボードの位置を更新
      board.position.copy(boardInitialPosition.clone().add(delta));
    }
  });
  
  // グリップ中は線の色を変更
  controllers.forEach((controller, index) => {
    controller.children.forEach(child => {
      if (child.name === 'controller-line') {
        child.material.color.set(isGripping[index] ? 0xff0000 : 0x4b6cb7);
      }
    });
  });
}

// renderFrame関数を更新してボード位置の更新を含める
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
      
      // グリップ操作によるボード位置の更新
      updateBoardPosition();
      
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

// -------------------------------
// WebXR終了ボタンを作成する関数
// -------------------------------
function createExitButton() {
  const exitButtonGroup = new THREE.Group();
  
  // 背景となる半透明の丸い板
  const bgGeometry = new THREE.CircleGeometry(0.05, 32);
  const bgMaterial = new THREE.MeshBasicMaterial({
    color: 0x333333,
    transparent: true,
    opacity: 0.7,
    side: THREE.DoubleSide
  });
  const bg = new THREE.Mesh(bgGeometry, bgMaterial);
  bg.rotation.x = -Math.PI / 2;
  exitButtonGroup.add(bg);
  
  // 戻るアイコン（×印）
  const iconGeometry = new THREE.BufferGeometry();
  const points = [
    // X印の左上から右下
    new THREE.Vector3(-0.025, 0.001, -0.025),
    new THREE.Vector3(0.025, 0.001, 0.025),
    // X印の右上から左下
    new THREE.Vector3(0.025, 0.001, -0.025),
    new THREE.Vector3(-0.025, 0.001, 0.025)
  ];
  iconGeometry.setFromPoints(points);
  const iconMaterial = new THREE.LineBasicMaterial({ color: 0xffffff, linewidth: 3 });
  const icon = new THREE.LineSegments(iconGeometry, iconMaterial);
  exitButtonGroup.add(icon);
  
  // ボタンにユーザーデータを設定
  exitButtonGroup.userData = {
    type: 'exit-button',
    hovering: false
  };
  
  // 常にカメラの左上に表示されるように設定
  exitButtonGroup.position.set(-0.15, 0.15, -0.3);
  exitButtonGroup.userData.faceCamera = true;
  
  return exitButtonGroup;
}

// -------------------------------
// WebXR終了ボタンを更新する関数
// -------------------------------
function updateExitButton(frame) {
  if (!exitButton) return;
  
  // カメラに対して常に正面を向くように
  if (exitButton.userData.faceCamera && camera) {
    // カメラの位置を取得
    const cameraWorldPosition = new THREE.Vector3();
    camera.getWorldPosition(cameraWorldPosition);
    
    // ボタンをカメラの前に配置（左上）
    exitButton.position.copy(cameraWorldPosition);
    
    // カメラの向きを取得
    const cameraWorldDirection = new THREE.Vector3();
    camera.getWorldDirection(cameraWorldDirection);
    
    // カメラの右と上のベクトルを計算
    const cameraRight = new THREE.Vector3();
    const cameraUp = new THREE.Vector3(0, 1, 0);
    cameraRight.crossVectors(cameraWorldDirection, cameraUp).normalize();
    cameraUp.crossVectors(cameraRight, cameraWorldDirection).normalize();
    
    // カメラの前方に移動し、左上に配置
    exitButton.position.addScaledVector(cameraWorldDirection, -0.3);
    exitButton.position.addScaledVector(cameraRight, -0.15);
    exitButton.position.addScaledVector(cameraUp, 0.15);
    
    // カメラに向ける
    exitButton.lookAt(cameraWorldPosition);
  }
  
  // コントローラーとの交差判定
  controllers.forEach(controller => {
    // コントローラーのレイを表す
    const raycaster = new THREE.Raycaster();
    const tempMatrix = new THREE.Matrix4();
    tempMatrix.identity().extractRotation(controller.matrixWorld);
    raycaster.ray.origin.setFromMatrixPosition(controller.matrixWorld);
    raycaster.ray.direction.set(0, 0, -1).applyMatrix4(tempMatrix);
    
    // 終了ボタンとの交差判定
    const intersects = raycaster.intersectObject(exitButton.children[0], true);
    
    if (intersects.length > 0) {
      // ホバー中は少し拡大
      if (!exitButton.userData.hovering) {
        exitButton.userData.hovering = true;
        exitButton.scale.set(1.2, 1.2, 1.2);
        exitButton.children[0].material.color.set(0x4b6cb7);
      }
    } else if (exitButton.userData.hovering) {
      // ホバー解除で元に戻す
      exitButton.userData.hovering = false;
      exitButton.scale.set(1.0, 1.0, 1.0);
      exitButton.children[0].material.color.set(0x333333);
    }
  });
}

// -------------------------------
// 初期化関数
// -------------------------------
function init() {
  // シーンの作成
  scene = new THREE.Scene();
  
  // カメラの作成
  camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
  camera.position.set(0, 1.6, 3);
  
  // レンダラーの作成
  renderer = new THREE.WebGLRenderer({ 
    antialias: true,
    alpha: true,
    canvas: document.getElementById('canvas')
  });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.xr.enabled = true;
  
  // 環境光
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
  scene.add(ambientLight);
  
  // 平行光源
  const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
  directionalLight.position.set(1, 2, 1);
  scene.add(directionalLight);
  
  // オセロ盤の作成（初期状態は非表示）
  createBoard();
  board.visible = false;
  scene.add(board);
  
  // ゲーム状態の初期化
  initBoardState();
  
  // ウィンドウのリサイズイベントリスナーを登録
  window.addEventListener('resize', onWindowResize);
  
  // WebXRのサポート状況を確認
  checkWebXRSupport();
  
  // スタートボタンのイベントリスナーを登録
  document.getElementById('startButton').addEventListener('click', startXRSession);
}

// -------------------------------
// ウィンドウのリサイズに応じてカメラとレンダラーを更新する関数
// -------------------------------
function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

// -------------------------------
// WebXRのサポート状況を確認する関数
// -------------------------------
function checkWebXRSupport() {
  const deviceMessage = document.getElementById('device-message');
  
  if (navigator.xr) {
    navigator.xr.isSessionSupported('immersive-ar')
      .then(supported => {
        if (supported) {
          deviceMessage.textContent = 'WebXR ARがサポートされています！';
          document.getElementById('startButton').disabled = false;
        } else {
          deviceMessage.textContent = 'WebXR ARはサポートされていませんが、VRは利用可能かもしれません';
          document.getElementById('startButton').disabled = true;
        }
      })
      .catch(err => {
        deviceMessage.textContent = 'WebXRの確認中にエラーが発生しました: ' + err;
        document.getElementById('startButton').disabled = true;
      });
  } else {
    deviceMessage.textContent = 'WebXRはお使いのブラウザでサポートされていません';
    document.getElementById('startButton').disabled = true;
  }
}

// -------------------------------
// ゲームボードの状態を初期化する関数
// -------------------------------
function initBoardState() {
  boardState = Array(8).fill().map(() => Array(8).fill(0));
}

// -------------------------------
// オセロ盤を作成する関数
// -------------------------------
function createBoard() {
  board = new THREE.Group();
  
  // 盤面の基本設定
  const boardWidth = 0.5;
  const boardHeight = 0.02;
  const boardDepth = 0.5;
  
  // 盤面の木目調テクスチャを作成
  const boardTexture = createWoodTexture();
  
  // 盤面のマテリアル
  const boardMaterial = new THREE.MeshStandardMaterial({
    map: boardTexture,
    roughness: 0.5,
    metalness: 0.1
  });
  
  // 盤面のジオメトリ
  const boardGeometry = new THREE.BoxGeometry(boardWidth, boardHeight, boardDepth);
  
  // 盤面のメッシュ
  boardBase = new THREE.Mesh(boardGeometry, boardMaterial);
  boardBase.receiveShadow = true;
  boardBase.name = 'board-base';
  board.add(boardBase);
  
  // グリッド線と駒の位置を追加
  addGridAndPositions();
  
  // 盤面カーソルを作成
  createBoardCursor();
  
  // 持ち駒ケースを作成
  initPieceCases();
  
  // ステータス表示を作成
  createStatusDisplay();
  
  return board;
}

// -------------------------------
// 木目調テクスチャを作成する関数
// -------------------------------
function createWoodTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');
  
  // 下地の色（濃い茶色）
  ctx.fillStyle = '#3d2b1f';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  
  // 木目のパターンを描画
  ctx.strokeStyle = '#4d3423';
  ctx.lineWidth = 2;
  
  // ランダムな木目を描画
  for (let i = 0; i < 40; i++) {
    ctx.beginPath();
    const startX = Math.random() * canvas.width;
    const startY = Math.random() * canvas.height;
    ctx.moveTo(startX, startY);
    
    // 曲線を描画
    const cp1x = startX + 100 + Math.random() * 100;
    const cp1y = startY + (Math.random() - 0.5) * 200;
    const cp2x = startX + 200 + Math.random() * 100;
    const cp2y = startY + (Math.random() - 0.5) * 200;
    const endX = startX + 300 + Math.random() * 100;
    const endY = startY + (Math.random() - 0.5) * 200;
    
    ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, endX, endY);
    ctx.stroke();
  }
  
  // グリッド線の描画（8x8）
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = 4;
  
  // 縦線
  for (let i = 1; i < 8; i++) {
    const x = i * (canvas.width / 8);
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, canvas.height);
    ctx.stroke();
  }
  
  // 横線
  for (let i = 1; i < 8; i++) {
    const y = i * (canvas.height / 8);
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(canvas.width, y);
    ctx.stroke();
  }
  
  const texture = new THREE.CanvasTexture(canvas);
  return texture;
}

// -------------------------------
// グリッド線と駒の位置を追加する関数
// -------------------------------
function addGridAndPositions() {
  // この関数はテクスチャで代替されるため、実装は省略
}

// -------------------------------
// 盤面カーソルを作成する関数
// -------------------------------
function createBoardCursor() {
  const cursorGeometry = new THREE.RingGeometry(0.025, 0.028, 32);
  const cursorMaterial = new THREE.MeshBasicMaterial({
    color: 0x00ff00,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.8
  });
  
  boardCursor = new THREE.Mesh(cursorGeometry, cursorMaterial);
  boardCursor.rotation.x = -Math.PI / 2;
  boardCursor.position.y = 0.001;
  boardCursor.visible = false;
  boardCursor.renderOrder = 50;
  board.add(boardCursor);
}

// -------------------------------
// ステータス表示を作成する関数
// -------------------------------
function createStatusDisplay() {
  statusDisplay = new THREE.Group();
  statusDisplay.position.set(0, 0.25, 0);
  statusDisplay.visible = false;
  
  // ステータス背景
  const statusBgGeometry = new THREE.PlaneGeometry(0.4, 0.08);
  const statusBgMaterial = new THREE.MeshBasicMaterial({
    color: 0x000000,
    transparent: true,
    opacity: 0.7,
    side: THREE.DoubleSide
  });
  
  const statusBg = new THREE.Mesh(statusBgGeometry, statusBgMaterial);
  statusBg.position.set(0, 0, 0);
  statusDisplay.add(statusBg);
  
  // テキスト表示用のキャンバステクスチャ
  const canvas = document.createElement('canvas');
  canvas.width = 400;
  canvas.height = 80;
  const ctx = canvas.getContext('2d');
  
  // テキストの設定
  ctx.fillStyle = 'white';
  ctx.font = 'bold 32px Arial';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('あなたの番です', canvas.width / 2, canvas.height / 2);
  
  // テクスチャを作成
  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  
  // テキスト表示用のメッシュ
  const textGeometry = new THREE.PlaneGeometry(0.38, 0.076);
  const textMaterial = new THREE.MeshBasicMaterial({
    map: texture,
    transparent: true,
    side: THREE.DoubleSide
  });
  
  const textMesh = new THREE.Mesh(textGeometry, textMaterial);
  textMesh.position.set(0, 0, 0.001);
  statusDisplay.add(textMesh);
  
  // キャンバスとコンテキストを保存（テキスト更新用）
  statusDisplay.userData = {
    canvas: canvas,
    context: ctx,
    texture: texture
  };
  
  board.add(statusDisplay);
}

// -------------------------------
// ステータス表示のテキストを更新する関数
// -------------------------------
function updateGameMessage(message) {
  if (!statusDisplay) return;
  
  const { canvas, context, texture } = statusDisplay.userData;
  
  // キャンバスをクリア
  context.clearRect(0, 0, canvas.width, canvas.height);
  
  // テキストの設定
  context.fillStyle = 'white';
  context.font = 'bold 32px Arial';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText(message, canvas.width / 2, canvas.height / 2);
  
  // テクスチャを更新
  texture.needsUpdate = true;
}

// -------------------------------
// ステータス表示を更新する関数
// -------------------------------
function updateStatusDisplay(deltaTime) {
  if (!statusDisplay) return;
  
  // カメラの方向に向ける
  const cameraWorldPosition = new THREE.Vector3();
  camera.getWorldPosition(cameraWorldPosition);
  
  // statusDisplayのワールド座標を取得
  const statusWorldPosition = new THREE.Vector3();
  statusDisplay.getWorldPosition(statusWorldPosition);
  
  // カメラとの方向ベクトルを計算
  const dirToCamera = new THREE.Vector3().subVectors(cameraWorldPosition, statusWorldPosition);
  dirToCamera.y = 0; // Y軸回転のみ
  
  if (dirToCamera.length() > 0.001) {
    statusDisplay.lookAt(
      statusWorldPosition.x + dirToCamera.x,
      statusWorldPosition.y,
      statusWorldPosition.z + dirToCamera.z
    );
  }
}

// -------------------------------
// パーティクルシステムを作成する関数
// -------------------------------
function createParticleSystem() {
  // 簡易的なパーティクルシステム
  const particleCount = 100;
  const particleGeometry = new THREE.BufferGeometry();
  const particlePositions = new Float32Array(particleCount * 3);
  
  for (let i = 0; i < particleCount * 3; i += 3) {
    particlePositions[i] = (Math.random() - 0.5) * 0.5;
    particlePositions[i + 1] = Math.random() * 0.2 + 0.05;
    particlePositions[i + 2] = (Math.random() - 0.5) * 0.5;
  }
  
  particleGeometry.setAttribute('position', new THREE.BufferAttribute(particlePositions, 3));
  
  const particleMaterial = new THREE.PointsMaterial({
    color: 0x88ccff,
    size: 0.01,
    transparent: true,
    opacity: 0.7
  });
  
  const particleSystem = new THREE.Points(particleGeometry, particleMaterial);
  particleSystem.userData = {
    velocities: Array(particleCount).fill().map(() => new THREE.Vector3(
      (Math.random() - 0.5) * 0.01,
      Math.random() * 0.01,
      (Math.random() - 0.5) * 0.01
    )),
    lifetimes: Array(particleCount).fill().map(() => Math.random() * 2 + 1),
    ages: Array(particleCount).fill(0)
  };
  
  particles.push(particleSystem);
  scene.add(particleSystem);
  
  return particleSystem;
}

// -------------------------------
// パーティクルシステムを更新する関数
// -------------------------------
function updateParticles(deltaTime) {
  particles.forEach((particleSystem, systemIndex) => {
    const positions = particleSystem.geometry.attributes.position.array;
    const velocities = particleSystem.userData.velocities;
    const lifetimes = particleSystem.userData.lifetimes;
    const ages = particleSystem.userData.ages;
    
    let allDead = true;
    
    for (let i = 0; i < positions.length / 3; i++) {
      if (ages[i] < lifetimes[i]) {
        // 粒子がまだ生きている
        allDead = false;
        ages[i] += deltaTime;
        
        // 位置を更新
        positions[i * 3] += velocities[i].x * deltaTime;
        positions[i * 3 + 1] += velocities[i].y * deltaTime;
        positions[i * 3 + 2] += velocities[i].z * deltaTime;
        
        // 重力の影響
        velocities[i].y -= 0.001 * deltaTime;
      } else {
        // 粒子の寿命が尽きたらリセット
        positions[i * 3] = (Math.random() - 0.5) * 0.5;
        positions[i * 3 + 1] = Math.random() * 0.2 + 0.05;
        positions[i * 3 + 2] = (Math.random() - 0.5) * 0.5;
        
        velocities[i].set(
          (Math.random() - 0.5) * 0.01,
          Math.random() * 0.01,
          (Math.random() - 0.5) * 0.01
        );
        
        ages[i] = 0;
        lifetimes[i] = Math.random() * 2 + 1;
      }
    }
    
    // ジオメトリを更新
    particleSystem.geometry.attributes.position.needsUpdate = true;
    
    // すべての粒子が寿命を迎えた場合、パーティクルシステムを削除
    if (allDead) {
      scene.remove(particleSystem);
      particles.splice(systemIndex, 1);
    }
  });
}

// -------------------------------
// ウェルカムパーティクルを作成する関数
// -------------------------------
function createWelcomeParticles() {
  const particleCount = 30;
  const particleGeometry = new THREE.BufferGeometry();
  const particlePositions = new Float32Array(particleCount * 3);
  
  for (let i = 0; i < particleCount * 3; i += 3) {
    particlePositions[i] = (Math.random() - 0.5) * 0.2;
    particlePositions[i + 1] = (Math.random() - 0.5) * 0.2;
    particlePositions[i + 2] = (Math.random() - 0.5) * 0.2;
  }
  
  particleGeometry.setAttribute('position', new THREE.BufferAttribute(particlePositions, 3));
  
  const particleMaterial = new THREE.PointsMaterial({
    color: 0xffcc88,
    size: 0.015,
    transparent: true,
    opacity: 0.8
  });
  
  const particleSystem = new THREE.Points(particleGeometry, particleMaterial);
  particleSystem.userData = {
    velocities: Array(particleCount).fill().map(() => new THREE.Vector3(
      (Math.random() - 0.5) * 0.005,
      (Math.random() - 0.5) * 0.005,
      (Math.random() - 0.5) * 0.005
    ))
  };
  
  return particleSystem;
}

// -------------------------------
// ウェルカムパーティクルを更新する関数
// -------------------------------
function updateWelcomeParticles(deltaTime) {
  welcomeParticles.forEach((particleSystem, systemIndex) => {
    const positions = particleSystem.geometry.attributes.position.array;
    const velocities = particleSystem.userData.velocities;
    
    for (let i = 0; i < positions.length / 3; i++) {
      // 位置を更新
      positions[i * 3] += velocities[i].x * deltaTime;
      positions[i * 3 + 1] += velocities[i].y * deltaTime;
      positions[i * 3 + 2] += velocities[i].z * deltaTime;
      
      // バウンダリ内に留める
      if (Math.abs(positions[i * 3]) > 0.3) velocities[i].x *= -1;
      if (Math.abs(positions[i * 3 + 1]) > 0.3) velocities[i].y *= -1;
      if (Math.abs(positions[i * 3 + 2]) > 0.3) velocities[i].z *= -1;
    }
    
    // ジオメトリを更新
    particleSystem.geometry.attributes.position.needsUpdate = true;
  });
}

// -------------------------------
// 初期環境を配置する関数
// -------------------------------
function placeInitialEnvironment() {
  // 難易度選択メニューを作成
  difficultyMenu = createDifficultyMenu();
  difficultyMenu.position.set(0, 1.3, -1.1);
  difficultyMenu.userData.faceCamera = true;
  scene.add(difficultyMenu);
  difficultySelected = false;
  
  // ウェルカムパーティクルを追加
  const welcomeParticle = createWelcomeParticles();
  welcomeParticle.position.set(0, 1.3, -1.1);
  scene.add(welcomeParticle);
  welcomeParticles.push(welcomeParticle);
  
  // 効果音
  playSound('start');
}

// -------------------------------
// 難易度選択メニューを作成する関数
// -------------------------------
function createDifficultyMenu() {
  const menuGroup = new THREE.Group();
  
  // メニュー背景
  const menuBgGeometry = new THREE.PlaneGeometry(0.5, 0.3);
  const menuBgMaterial = new THREE.MeshBasicMaterial({
    color: 0x000033,
    transparent: true,
    opacity: 0.8,
    side: THREE.DoubleSide
  });
  
  const menuBg = new THREE.Mesh(menuBgGeometry, menuBgMaterial);
  menuBg.name = 'menu-background';
  menuGroup.add(menuBg);
  
  // メニュータイトル
  const titleCanvas = document.createElement('canvas');
  titleCanvas.width = 512;
  titleCanvas.height = 128;
  const titleCtx = titleCanvas.getContext('2d');
  
  titleCtx.fillStyle = 'white';
  titleCtx.font = 'bold 40px Arial';
  titleCtx.textAlign = 'center';
  titleCtx.textBaseline = 'middle';
  titleCtx.fillText('難易度を選択', titleCanvas.width / 2, titleCanvas.height / 2);
  
  const titleTexture = new THREE.CanvasTexture(titleCanvas);
  const titleGeometry = new THREE.PlaneGeometry(0.4, 0.1);
  const titleMaterial = new THREE.MeshBasicMaterial({
    map: titleTexture,
    transparent: true,
    side: THREE.DoubleSide
  });
  
  const titleMesh = new THREE.Mesh(titleGeometry, titleMaterial);
  titleMesh.position.set(0, 0.08, 0.001);
  menuGroup.add(titleMesh);
  
  // 難易度ボタン
  const levels = [
    { name: '初級', value: 'easy', y: 0 },
    { name: '中級', value: 'medium', y: -0.06 },
    { name: '上級', value: 'hard', y: -0.12 }
  ];
  
  levels.forEach(level => {
    const buttonCanvas = document.createElement('canvas');
    buttonCanvas.width = 256;
    buttonCanvas.height = 64;
    const buttonCtx = buttonCanvas.getContext('2d');
    
    buttonCtx.fillStyle = level.value === 'medium' ? '#4b6cb7' : '#445566';
    buttonCtx.fillRect(0, 0, buttonCanvas.width, buttonCanvas.height);
    buttonCtx.strokeStyle = 'white';
    buttonCtx.lineWidth = 2;
    buttonCtx.strokeRect(2, 2, buttonCanvas.width - 4, buttonCanvas.height - 4);
    
    buttonCtx.fillStyle = 'white';
    buttonCtx.font = 'bold 24px Arial';
    buttonCtx.textAlign = 'center';
    buttonCtx.textBaseline = 'middle';
    buttonCtx.fillText(level.name, buttonCanvas.width / 2, buttonCanvas.height / 2);
    
    const buttonTexture = new THREE.CanvasTexture(buttonCanvas);
    const buttonGeometry = new THREE.PlaneGeometry(0.25, 0.05);
    const buttonMaterial = new THREE.MeshBasicMaterial({
      map: buttonTexture,
      transparent: true,
      side: THREE.DoubleSide
    });
    
    const buttonMesh = new THREE.Mesh(buttonGeometry, buttonMaterial);
    buttonMesh.position.set(0, level.y, 0.002);
    buttonMesh.name = `difficulty-${level.value}`;
    buttonMesh.userData = {
      type: 'button',
      value: level.value,
      hovered: false
    };
    
    menuGroup.add(buttonMesh);
  });
  
  return menuGroup;
}

// -------------------------------
// 難易度メニューを更新する関数
// -------------------------------
function updateDifficultyMenu(deltaTime) {
  if (!difficultyMenu) return;
  
  // カメラの方向に向ける
  if (difficultyMenu.userData.faceCamera) {
    const cameraWorldPosition = new THREE.Vector3();
    camera.getWorldPosition(cameraWorldPosition);
    
    const menuWorldPosition = new THREE.Vector3();
    difficultyMenu.getWorldPosition(menuWorldPosition);
    
    const dirToCamera = new THREE.Vector3().subVectors(cameraWorldPosition, menuWorldPosition);
    dirToCamera.y = 0; // Y軸回転のみ
    
    if (dirToCamera.length() > 0.001) {
      difficultyMenu.lookAt(
        menuWorldPosition.x + dirToCamera.x,
        menuWorldPosition.y,
        menuWorldPosition.z + dirToCamera.z
      );
    }
  }
  
  // コントローラーとの交差判定
  let menuInteracted = false;
  
  controllers.forEach(controller => {
    if (menuInteracted) return;
    
    const raycaster = new THREE.Raycaster();
    const tempMatrix = new THREE.Matrix4();
    tempMatrix.identity().extractRotation(controller.matrixWorld);
    raycaster.ray.origin.setFromMatrixPosition(controller.matrixWorld);
    raycaster.ray.direction.set(0, 0, -1).applyMatrix4(tempMatrix);
    
    // メニュー内のボタンとの交差判定
    difficultyMenu.children.forEach(child => {
      if (child.userData && child.userData.type === 'button') {
        const intersects = raycaster.intersectObject(child);
        
        if (intersects.length > 0) {
          // ホバー効果
          if (!child.userData.hovered) {
            child.userData.hovered = true;
            child.scale.set(1.1, 1.1, 1.1);
          }
          
          // ボタン押下判定
          controller.children.forEach(controllerChild => {
            if (controllerChild.name === 'controller-line') {
              controllerChild.material.color.set(0x00ff00);
            }
          });
          
          menuInteracted = true;
        } else if (child.userData.hovered) {
          child.userData.hovered = false;
          child.scale.set(1.0, 1.0, 1.0);
          
          controller.children.forEach(controllerChild => {
            if (controllerChild.name === 'controller-line') {
              controllerChild.material.color.set(0x4b6cb7);
            }
          });
        }
      }
    });
  });
}

// -------------------------------
// 駒を作成する関数
// -------------------------------
function createPiece(player) {
  const radius = 0.028;
  const height = 0.007;
  const segments = 32;
  
  const geometry = new THREE.CylinderGeometry(radius, radius, height, segments);
  
  // 黒駒と白駒で異なるマテリアル
  const material = player === 1 ?
    new THREE.MeshPhysicalMaterial({
      color: 0x111111,
      metalness: 0.15,
      roughness: 0.15,
      reflectivity: 0.6,
      clearcoat: 0.4,
      clearcoatRoughness: 0.15
    }) :
    new THREE.MeshPhysicalMaterial({
      color: 0xf5f5f5,
      metalness: 0.12,
      roughness: 0.25,
      reflectivity: 0.8,
      clearcoat: 0.6,
      clearcoatRoughness: 0.08
    });
  
  const piece = new THREE.Mesh(geometry, material);
  piece.castShadow = true;
  piece.receiveShadow = true;
  
  // ユーザーデータを設定
  piece.userData = {
    player: player
  };
  
  return piece;
}

// -------------------------------
// 駒を置く関数
// -------------------------------
function placePiece(row, col, player, controller = null) {
  if (row < 0 || row >= 8 || col < 0 || col >= 8) return false;
  
  if (boardState[row][col] !== 0) {
    // 既に駒が置かれている場所には置けない
    return false;
  }
  
  // 有効な手かどうかをチェック
  if (player === 1 && !isValidMove(row, col, player)) {
    return false;
  }
  
  // 盤面の状態を更新
  boardState[row][col] = player;
  
  // ボード上の位置を計算
  const boardX = -0.25 + 0.03125 + (col * 0.0625);
  const boardZ = -0.25 + 0.03125 + (row * 0.0625);
  
  // 駒を作成
  const piece = createPiece(player);
  piece.rotation.x = Math.PI / 2; // 駒を水平に寝かせる
  piece.position.set(boardX, 0.02, boardZ);
  
  // 駒をボードに追加
  board.add(piece);
  pieces.push(piece);
  
  // 駒を置いた効果音再生
  if (player === 1) {
    playSound('placePlayer');
    decreasePlayerPieces();
  } else {
    playSound('placeCPU');
    decreaseCPUPieces();
  }
  
  // ひっくり返せる駒を検出し、ひっくり返す
  const flipped = flipPieces(row, col, player);
  
  return flipped.length > 0 || true;
}

// -------------------------------
// 与えられた位置が有効な手かどうかをチェックする関数
// -------------------------------
function isValidMove(row, col, player) {
  // 既に駒が置かれている場所には置けない
  if (boardState[row][col] !== 0) {
    return false;
  }
  
  // 8方向をチェック
  const directions = [
    { dr: -1, dc: 0 },  // 上
    { dr: 1, dc: 0 },   // 下
    { dr: 0, dc: -1 },  // 左
    { dr: 0, dc: 1 },   // 右
    { dr: -1, dc: -1 }, // 左上
    { dr: -1, dc: 1 },  // 右上
    { dr: 1, dc: -1 },  // 左下
    { dr: 1, dc: 1 }    // 右下
  ];
  
  for (const dir of directions) {
    let r = row + dir.dr;
    let c = col + dir.dc;
    let hasOpponent = false;
    
    // 盤面の範囲内で、隣が相手の駒か確認
    while (r >= 0 && r < 8 && c >= 0 && c < 8 && boardState[r][c] === -player) {
      hasOpponent = true;
      r += dir.dr;
      c += dir.dc;
    }
    
    // 少なくとも1つの相手の駒があり、その先に自分の駒があるか
    if (hasOpponent && r >= 0 && r < 8 && c >= 0 && c < 8 && boardState[r][c] === player) {
      return true;
    }
  }
  
  return false;
}

// -------------------------------
// 駒をひっくり返す関数
// -------------------------------
function flipPieces(row, col, player) {
  const flippedPieces = [];
  
  // 8方向をチェック
  const directions = [
    { dr: -1, dc: 0 },  // 上
    { dr: 1, dc: 0 },   // 下
    { dr: 0, dc: -1 },  // 左
    { dr: 0, dc: 1 },   // 右
    { dr: -1, dc: -1 }, // 左上
    { dr: -1, dc: 1 },  // 右上
    { dr: 1, dc: -1 },  // 左下
    { dr: 1, dc: 1 }    // 右下
  ];
  
  for (const dir of directions) {
    let r = row + dir.dr;
    let c = col + dir.dc;
    const toFlip = [];
    
    // 盤面の範囲内で、隣が相手の駒か確認
    while (r >= 0 && r < 8 && c >= 0 && c < 8 && boardState[r][c] === -player) {
      toFlip.push({ row: r, col: c });
      r += dir.dr;
      c += dir.dc;
    }
    
    // 少なくとも1つの相手の駒があり、その先に自分の駒があるか
    if (toFlip.length > 0 && r >= 0 && r < 8 && c >= 0 && c < 8 && boardState[r][c] === player) {
      // この方向の駒をひっくり返す
      for (const pos of toFlip) {
        // 盤面の状態を更新
        boardState[pos.row][pos.col] = player;
        
        // ボード上の位置を計算
        const boardX = -0.25 + 0.03125 + (pos.col * 0.0625);
        const boardZ = -0.25 + 0.03125 + (pos.row * 0.0625);
        
        // ボード上の駒を検索
        let found = false;
        for (const existingPiece of pieces) {
          if (
            Math.abs(existingPiece.position.x - boardX) < 0.01 &&
            Math.abs(existingPiece.position.z - boardZ) < 0.01
          ) {
            // 既存の駒を見つけた
            found = true;
            
            // マテリアルを更新
            existingPiece.material = player === 1 ?
              new THREE.MeshPhysicalMaterial({
                color: 0x111111,
                metalness: 0.15,
                roughness: 0.15,
                reflectivity: 0.6,
                clearcoat: 0.4,
                clearcoatRoughness: 0.15
              }) :
              new THREE.MeshPhysicalMaterial({
                color: 0xf5f5f5,
                metalness: 0.12,
                roughness: 0.25,
                reflectivity: 0.8,
                clearcoat: 0.6,
                clearcoatRoughness: 0.08
              });
            
            // ユーザーデータを更新
            existingPiece.userData.player = player;
            
            flippedPieces.push(existingPiece);
            break;
          }
        }
        
        if (!found) {
          // 駒が見つからない場合は新しく作成（通常は起こらないはず）
          const piece = createPiece(player);
          piece.rotation.x = Math.PI / 2;
          piece.position.set(boardX, 0.02, boardZ);
          board.add(piece);
          pieces.push(piece);
          flippedPieces.push(piece);
        }
      }
    }
  }
  
  return flippedPieces;
}

// ページ読み込み時に初期化を呼び出し
init();