import React, { useEffect, useRef, useState } from "react";
import io from "socket.io-client";
import Peer from "simple-peer";
import styled from "styled-components";

const Container = styled.div`
    padding: 20px;
    display: flex;
    height: 100vh;
    width: 90%;
    margin: auto;
    flex-wrap: wrap;
`;

const StyledVideo = styled.video`
    height: 40%;
    width: 50%;
`;

const Video = (props) => {
    const ref = useRef();

    useEffect(() => {
        props.peer.on("stream", stream => {
            ref.current.srcObject = stream;
        })
    }, []);

    return (
        <StyledVideo playsInline autoPlay ref={ref} />
    );
}


const videoConstraints = {
    height: window.innerHeight / 2,
    width: window.innerWidth / 2
};

const Room = (props) => {
    const [peers, setPeers] = useState([]);
    const socketRef = useRef();
    const userVideo = useRef();
    const peersRef = useRef([]);
    const roomID = props.match.params.roomID;

    // when first time mounted
    useEffect(() => {

        // connect with io server 
        socketRef.current = io.connect("/");

        // get camera and mic access
        navigator.mediaDevices.getUserMedia({ video: videoConstraints, audio: true }).then(stream => {
            userVideo.current.srcObject = stream;

            // tell server that you have joined call
            socketRef.current.emit("join room", roomID);

            // when join room is emitted then server will send list of already connected peers
            socketRef.current.on("all users", users => {
                const peers = [];
                users.forEach(userID => {

                    // use simple-peer to connect to other peers
                    // createPeer(userToSignal, callerID, stream)
                    //        returns peer object, it has abstracted it's stream and
                    //        contain info to determine whether it is a caller or callee
                    //        it also have attached listener to signal event, 
                    //        means when signal is emitted (by whom?) then this client will send signal to that peer
                    const peer = createPeer(userID, socketRef.current.id, stream);

                    // keep the list of peers with which connection is about to begin
                    peersRef.current.push({
                        peerID: userID,
                        peer,
                    })
                    peers.push(peer);
                })
                setPeers(peers);
            })

            // on join room server will emit "all users" as well as "user joined"
            // "all users" is listened by client which just connected witl server
            // "user joined" is listened by client(s) which were already connected
            socketRef.current.on("user joined", payload => {

                // addPeer creates callee side peer, just like create peer
                // the only difference is that this also adds the signal sent by caller into this peer
                const peer = addPeer(payload.signal, payload.callerID, stream);
                peersRef.current.push({
                    peerID: payload.callerID,
                    peer,
                })

                setPeers(users => [...users, peer]);
            });

            // what to do when you receive answer (returned signal) of initial signal 
            socketRef.current.on("receiving returned signal", payload => {
                // find peer object which corresponds to current  client, and then add answer of remote peer in it
                const item = peersRef.current.find(p => p.peerID === payload.id);
                item.peer.signal(payload.signal);
            });
        })
    }, []);

    function createPeer(userToSignal, callerID, stream) {
        const peer = new Peer({
            initiator: true,
            trickle: false,
            stream,
        });

        peer.on("signal", signal => {
            socketRef.current.emit("sending signal", { userToSignal, callerID, signal })
        })

        return peer;
    }

    function addPeer(incomingSignal, callerID, stream) {
        const peer = new Peer({
            initiator: false,
            trickle: false,
            stream,
        })

        peer.on("signal", signal => {
            socketRef.current.emit("returning signal", { signal, callerID })
        })

        peer.signal(incomingSignal);

        return peer;
    }

    return (
        <Container>
            <StyledVideo muted ref={userVideo} autoPlay playsInline />
            {peers.map((peer, index) => {
                return (
                    <Video key={index} peer={peer} />
                );
            })}
        </Container>
    );
};

export default Room;
