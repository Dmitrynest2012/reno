let localStream;
let peerConnection;
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

startCallBtn.onclick = async () => {
    peerConnection = new RTCPeerConnection(config);
    localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));

    localVideo.srcObject = localStream;
    peerConnection.ontrack = event => remoteVideo.srcObject = event.streams[0];

    peerConnection.onicecandidate = event => {
        if (event.candidate) {
            offerText.value = JSON.stringify(peerConnection.localDescription);
        }
    };

    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);
};

acceptCallBtn.onclick = async () => {
    peerConnection = new RTCPeerConnection(config);
    localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));

    localVideo.srcObject = localStream;
    peerConnection.ontrack = event => remoteVideo.srcObject = event.streams[0];

    peerConnection.onicecandidate = event => {
        if (event.candidate) {
            answerText.value = JSON.stringify(peerConnection.localDescription);
        }
    };

    const offer = JSON.parse(offerText.value);
    await peerConnection.setRemoteDescription(offer);
    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);
};

connectBtn.onclick = async () => {
    const answer = JSON.parse(answerText.value);
    await peerConnection.setRemoteDescription(answer);
};

copyOfferBtn.onclick = () => {
    offerText.select();
    document.execCommand("copy");
};

// Управление микрофоном и камерой
toggleMicBtn.onclick = () => {
    if (localStream) {
        let audioTrack = localStream.getAudioTracks()[0];
        if (audioTrack) {
            audioTrack.enabled = !audioTrack.enabled;
            toggleMicBtn.textContent = audioTrack.enabled ? "🎤 Выключить микрофон" : "🎤 Включить микрофон";
        }
    }
};

toggleCamBtn.onclick = () => {
    if (localStream) {
        let videoTrack = localStream.getVideoTracks()[0];
        if (videoTrack) {
            videoTrack.enabled = !videoTrack.enabled;
            toggleCamBtn.textContent = videoTrack.enabled ? "📷 Выключить камеру" : "📷 Включить камеру";
        }
    }
};
