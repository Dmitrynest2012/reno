let localStream;
let peerConnection;
let dataChannel;
const config = { iceServers: [{ urls: "stun:stun.l.google.com:19302" }] };

const localVideo = document.getElementById("localVideo");
const remoteVideo = document.getElementById("remoteVideo");
const offerText = document.getElementById("offerText");
const answerText = document.getElementById("answerText");

const startCallBtn = document.getElementById("startCall");
const acceptCallBtn = document.getElementById("acceptCall");
const connectBtn = document.getElementById("connect");
const copyOfferBtn = document.getElementById("copyOffer");

const toggleMicBtn = document.getElementById("toggleMic");
const toggleCamBtn = document.getElementById("toggleCam");

const usernameInput = document.getElementById("usernameInput");
const remoteUsernameDisplay = document.getElementById("remoteUsernameDisplay");

let localUsername = usernameInput.value;
let audioContext, analyser, microphone;

startCallBtn.onclick = async () => {
    peerConnection = new RTCPeerConnection(config);
    
    dataChannel = peerConnection.createDataChannel("usernameChannel");
    setupDataChannel();

    try {
        localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    } catch (e) {
        console.log("Full media failed:", e);
        try {
            localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
            console.log("Got audio only");
        } catch (e) {
            console.log("Audio only failed:", e);
            localStream = new MediaStream();
            console.log("No media available, using empty stream");
        }
    }

    localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));
    localVideo.srcObject = localStream;
    peerConnection.ontrack = event => remoteVideo.srcObject = event.streams[0];

    peerConnection.onicecandidate = event => {
        if (event.candidate) {
            const jsonString = JSON.stringify(peerConnection.localDescription);
            const compressed = pako.gzip(jsonString); // Сжатие с помощью pako
            const base64 = btoa(String.fromCharCode.apply(null, compressed)); // Кодирование в Base64
            offerText.value = base64;
        }
    };

    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);
    
    setupAudioAnalysis();
};

acceptCallBtn.onclick = async () => {
    peerConnection = new RTCPeerConnection(config);
    
    peerConnection.ondatachannel = event => {
        dataChannel = event.channel;
        setupDataChannel();
    };

    try {
        localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    } catch (e) {
        console.log("Full media failed:", e);
        try {
            localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
            console.log("Got audio only");
        } catch (e) {
            console.log("Audio only failed:", e);
            localStream = new MediaStream();
            console.log("No media available, using empty stream");
        }
    }

    localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));
    localVideo.srcObject = localStream;
    peerConnection.ontrack = event => remoteVideo.srcObject = event.streams[0];

    peerConnection.onicecandidate = event => {
        if (event.candidate) {
            const jsonString = JSON.stringify(peerConnection.localDescription);
            const compressed = pako.gzip(jsonString); // Сжатие с помощью pako
            const base64 = btoa(String.fromCharCode.apply(null, compressed)); // Кодирование в Base64
            answerText.value = base64;
        }
    };

    const base64Offer = offerText.value;
    const compressedOffer = Uint8Array.from(atob(base64Offer), c => c.charCodeAt(0));
    const jsonStringOffer = pako.ungzip(compressedOffer, { to: 'string' });
    const offer = JSON.parse(jsonStringOffer);
    await peerConnection.setRemoteDescription(offer);
    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);
    
    setupAudioAnalysis();
};

connectBtn.onclick = async () => {
    const base64Answer = answerText.value;
    const compressedAnswer = Uint8Array.from(atob(base64Answer), c => c.charCodeAt(0));
    const jsonStringAnswer = pako.ungzip(compressedAnswer, { to: 'string' });
    const answer = JSON.parse(jsonStringAnswer);
    await peerConnection.setRemoteDescription(answer);
};

async function updateMediaStream() {
    if (!peerConnection) return;

    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
    }

    try {
        localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        console.log("Updated to full media");
    } catch (e) {
        console.log("Full media update failed:", e);
        try {
            localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
            console.log("Updated to audio only");
        } catch (e) {
            console.log("Audio update failed:", e);
            localStream = new MediaStream();
            console.log("Updated to empty stream");
        }
    }

    localVideo.srcObject = localStream;

    const senders = peerConnection.getSenders();
    localStream.getTracks().forEach(track => {
        const existingSender = senders.find(sender => sender.track && sender.track.kind === track.kind);
        if (existingSender) {
            existingSender.replaceTrack(track);
        } else {
            peerConnection.addTrack(track, localStream);
        }
    });

    setupAudioAnalysis();
}

function setupDataChannel() {
    dataChannel.onopen = () => {
        console.log("Data channel opened");
        sendUsernameAndMicState();
    };
    dataChannel.onmessage = event => {
        const data = JSON.parse(event.data);
        console.log("Received data:", data);
        remoteUsernameDisplay.textContent = data.username;
        updateRemoteBorder(data.micState);
    };
}

function sendUsernameAndMicState() {
    const micEnabled = localStream && localStream.getAudioTracks().length > 0 && localStream.getAudioTracks()[0].enabled;
    const micState = micEnabled ? (isAudioActive() ? "active" : "inactive") : "off";
    updateLocalBorder(micState);
    
    if (dataChannel && dataChannel.readyState === "open") {
        const data = { username: localUsername, micState };
        dataChannel.send(JSON.stringify(data));
        console.log("Sent data:", data);
    }
}

function updateLocalBorder(micState) {
    const localWrapper = localVideo.parentElement;
    if (micState === "active") {
        localWrapper.style.borderColor = "#00b4d8";
    } else {
        localWrapper.style.borderColor = "#333";
    }
}

function updateRemoteBorder(micState) {
    const remoteWrapper = remoteVideo.parentElement;
    if (micState === "active") {
        remoteWrapper.style.borderColor = "#00b4d8";
    } else {
        remoteWrapper.style.borderColor = "#333";
    }
}

function setupAudioAnalysis() {
    if (!localStream || localStream.getAudioTracks().length === 0) {
        console.log("No audio track available for analysis");
        return;
    }
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    analyser = audioContext.createAnalyser();
    microphone = audioContext.createMediaStreamSource(localStream);
    microphone.connect(analyser);
    analyser.fftSize = 256;
    console.log("Audio analysis setup complete");
    checkAudioLevel();
}

function isAudioActive() {
    if (!analyser) return false;
    const dataArray = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteFrequencyData(dataArray);
    const average = dataArray.reduce((a, b) => a + b) / dataArray.length;
    console.log("Audio level:", average);
    return average > 5;
}

function checkAudioLevel() {
    if (localStream && localStream.getAudioTracks().length > 0) {
        sendUsernameAndMicState();
    }
    requestAnimationFrame(checkAudioLevel);
}

copyOfferBtn.onclick = () => {
    offerText.select();
    document.execCommand("copy");
};

toggleMicBtn.onclick = () => {
    if (localStream && localStream.getAudioTracks().length > 0) {
        let audioTrack = localStream.getAudioTracks()[0];
        audioTrack.enabled = !audioTrack.enabled;
        toggleMicBtn.classList.toggle("off");
        sendUsernameAndMicState();
        console.log("Mic toggled:", audioTrack.enabled);
    } else {
        console.log("No audio track, updating media...");
        updateMediaStream();
    }
};

toggleCamBtn.onclick = () => {
    if (localStream && localStream.getVideoTracks().length > 0) {
        let videoTrack = localStream.getVideoTracks()[0];
        videoTrack.enabled = !videoTrack.enabled;
        toggleCamBtn.classList.toggle("off");
        console.log("Cam toggled:", videoTrack.enabled);
    } else {
        console.log("No video track, updating media...");
        updateMediaStream();
    }
};

usernameInput.oninput = () => {
    localUsername = usernameInput.value || "User1";
    sendUsernameAndMicState();
};