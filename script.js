// --- 1. 오디오 처리 변수 ---
let PASS_VOLUME = 30;
let audioContext = null;
let analyser = null;
let mediaStreamSource = null;
let bufferLength = 2048;
let buffer = new Float32Array(bufferLength);
let isListening = false;

// --- 2. 게임 로직 변수 ---
const strings = [5, 6];
const notes = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];
let currentTargetNote = "";

// --- 3. 유틸리티 ---
const noteStrings = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

function startApp() {
    document.getElementById('start-btn').style.display = 'none'; // 버튼 숨김

    // 빨간 기준선 위치 설정
    document.getElementById('vol-threshold-line').style.left = PASS_VOLUME + "%";
    document.getElementById('vol-display-text').innerText = `소리 크기 (${PASS_VOLUME}%):`;

    initAudio();
    nextCard();
    setupVolumeControl(); // 볼륨 조절 이벤트 등록
}

// --- 볼륨 조절 UI 로직 ---
function setupVolumeControl() {
    const volContainer = document.getElementById('vol-container');
    const thresholdLine = document.getElementById('vol-threshold-line');
    let isDragging = false;

    function updateThreshold(clientX) {
        const rect = volContainer.getBoundingClientRect();
        let x = clientX - rect.left;
        let percentage = (x / rect.width) * 100;

        // 범위 제한 (0 ~ 100)
        percentage = Math.max(0, Math.min(100, percentage));

        PASS_VOLUME = Math.round(percentage);
        thresholdLine.style.left = PASS_VOLUME + "%";
        document.getElementById('vol-display-text').innerText = `소리 크기 (${PASS_VOLUME}%):`;
    }

    // 마우스 이벤트
    volContainer.addEventListener('mousedown', (e) => {
        isDragging = true;
        updateThreshold(e.clientX);
    });

    window.addEventListener('mousemove', (e) => {
        if (isDragging) {
            updateThreshold(e.clientX);
        }
    });

    window.addEventListener('mouseup', () => {
        isDragging = false;
    });

    // 터치 이벤트 (모바일 지원)
    volContainer.addEventListener('touchstart', (e) => {
        isDragging = true;
        updateThreshold(e.touches[0].clientX);
    }, { passive: false });

    window.addEventListener('touchmove', (e) => {
        if (isDragging) {
            // 스크롤 방지
            if (e.cancelable) e.preventDefault();
            updateThreshold(e.touches[0].clientX);
        }
    }, { passive: false });

    window.addEventListener('touchend', () => {
        isDragging = false;
    });
}

// --- 4. 오디오 초기화 ---
async function initAudio() {
    try {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

        mediaStreamSource = audioContext.createMediaStreamSource(stream);
        analyser = audioContext.createAnalyser();
        analyser.fftSize = 2048;
        mediaStreamSource.connect(analyser);

        isListening = true;
        updatePitch();
    } catch (err) {
        alert("마이크 접근 불가: HTTPS 또는 Localhost 환경에서 실행해주세요.");
        console.error(err);
    }
}

// --- 5. 피치 & 볼륨 감지 루프 ---
function updatePitch() {
    if (!isListening) return;

    analyser.getFloatTimeDomainData(buffer);

    // 1. 볼륨(RMS) 계산
    let rms = 0;
    for (let i = 0; i < bufferLength; i++) {
        rms += buffer[i] * buffer[i];
    }
    rms = Math.sqrt(rms / bufferLength);

    // 볼륨 시각화 (0~100 스케일로 변환, 너무 작으면 증폭해서 보여줌)
    // rms는 보통 0.0~0.5 사이 값이므로 400을 곱해 %로 환산 (조정 가능)
    let visualVol = Math.min(100, Math.round(rms * 400));
    document.getElementById('vol-bar').style.width = visualVol + "%";
    // document.getElementById('vol-val').innerText = visualVol; // 디버깅용 수치

    // 2. 피치(음정) 감지
    let ac = autoCorrelate(buffer, audioContext.sampleRate);

    if (ac !== -1) {
        let note = noteFromPitch(ac);
        let noteName = noteStrings[note % 12];

        document.getElementById('detected-note').innerText = noteName;

        // 정답 체크 (음정이 맞고 && 볼륨이 기준치 이상일 때)
        if (visualVol >= PASS_VOLUME) {
            checkAnswer(noteName);
        }
    } else {
        // 소리가 없거나 불분명함
    }

    requestAnimationFrame(updatePitch);
}

// 자기상관 함수 (Pitch 감지)
function autoCorrelate(buf, sampleRate) {
    let SIZE = buf.length;
    // 볼륨이 너무 작으면 피치 계산 생략 (노이즈 방지)
    // 위에서 구한 rms를 써도 되지만 여기 로직 유지
    let rms = 0;
    for (let i = 0; i < SIZE; i++) rms += buf[i] * buf[i];
    rms = Math.sqrt(rms / SIZE);
    if (rms < 0.01) return -1;

    let r1 = 0, r2 = SIZE - 1, thres = 0.2;
    for (let i = 0; i < SIZE / 2; i++) {
        if (Math.abs(buf[i]) < thres) { r1 = i; break; }
    }
    for (let i = 1; i < SIZE / 2; i++) {
        if (Math.abs(buf[SIZE - i]) < thres) { r2 = SIZE - i; break; }
    }

    buf = buf.slice(r1, r2);
    SIZE = buf.length;

    let c = new Array(SIZE).fill(0);
    for (let i = 0; i < SIZE; i++) {
        for (let j = 0; j < SIZE - i; j++) {
            c[i] = c[i] + buf[j] * buf[j + i];
        }
    }

    let d = 0;
    while (c[d] > c[d + 1]) d++;
    let maxval = -1, maxpos = -1;
    for (let i = d; i < SIZE; i++) {
        if (c[i] > maxval) {
            maxval = c[i];
            maxpos = i;
        }
    }
    let T0 = maxpos;

    return sampleRate / T0;
}

function noteFromPitch(frequency) {
    let noteNum = 12 * (Math.log(frequency / 440) / Math.log(2));
    return Math.round(noteNum) + 69;
}

// --- 6. 정답 처리 ---
let checkThrottle = false;

function nextCard() {
    const rString = strings[Math.floor(Math.random() * strings.length)];
    let rNote;

    // 이전 문제와 같은 음(Note)이 나오지 않도록 반복
    do {
        rNote = notes[Math.floor(Math.random() * notes.length)];
    } while (rNote === currentTargetNote);

    currentTargetNote = rNote;

    document.getElementById('target-string').innerText = rString + "번 줄";
    document.getElementById('target-note').innerText = rNote;

    document.body.style.backgroundColor = "#222";
    document.getElementById('status').innerText = "연주해 보세요!";
    document.getElementById('status').className = "";
    document.getElementById('detected-note').style.color = "#fff";
}

function checkAnswer(detectedNote) {
    if (checkThrottle) return;

    if (detectedNote === currentTargetNote) {
        document.getElementById('status').innerText = "정답! (통과)";
        document.getElementById('status').className = "correct";
        document.body.style.backgroundColor = "#1b5e20";
        document.getElementById('detected-note').style.color = "#00e676";

        checkThrottle = true;
        setTimeout(() => {
            nextCard();
            checkThrottle = false;
        }, 1000);
    }
}
