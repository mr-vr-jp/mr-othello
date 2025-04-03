// グローバル変数
let scene, camera, renderer;
let board, boardState;
let playerPieces = [], cpuPieces = [];
let validMoveMarkers = [];
let isPlayerTurn = true;
let moveCount = 0;
let playerWins = 0, cpuWins = 0;
let difficultyLevel = 1; // 1: 初級, 2: 中級, 3: 上級
let xrSession = null;
let xrReferenceSpace = null;
let xrHitTestSource = null;
let difficultyMenu = null;
let statusDisplay = null;
let welcomeParticles = [];
let sounds = {};
let soundEnabled = true;
let listener = null;
let bgm = null;

// 定数
const MAX_PIECES = 32;
const BOARD_SIZE = 8;
const CELL_SIZE = 0.1;
const PIECE_HEIGHT = 0.02;
const PIECE_RADIUS = 0.04;

// 初期化関数
function init() {
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
  
  renderer = new THREE.WebGLRenderer({
    canvas: document.getElementById('canvas'),
    antialias: true,
    alpha: true
  });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  
  // シャドウマップを有効化
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  
  // 照明設定
  scene.add(new THREE.AmbientLight(0x404060, 0.5));
  
  // メインの平行光源（上から）
  const mainLight = new THREE.DirectionalLight(0xffffff, 0.9);
  mainLight.position.set(0, 10, 5);
  mainLight.castShadow = true;
  mainLight.shadow.mapSize.width = 256;
  mainLight.shadow.mapSize.height = 256;
  mainLight.shadow.camera.near = 1;
  mainLight.shadow.camera.far = 20;
  mainLight.shadow.camera.left = -2;
  mainLight.shadow.camera.right = 2;
  mainLight.shadow.camera.top = 2;
  mainLight.shadow.camera.bottom = -2;
  mainLight.shadow.bias = -0.001;
  mainLight.shadow.normalBias = 0.02;
  scene.add(mainLight);

  // その他の初期化処理...
  // （元のコードの残りの部分をここに移動）
}

// イベントリスナー
window.addEventListener('resize', onWindowResize);
document.getElementById('startButton').addEventListener('click', startGame);

// メインループ
function animate() {
  requestAnimationFrame(animate);
  renderer.render(scene, camera);
}

// 初期化を実行
init();
animate(); 