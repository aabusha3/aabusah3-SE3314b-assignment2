let singleton = require('./singleton.js');
let cPTP = require('./kadPTP.js');
let net = require('net');
const path = require( "path" );

net.bytesWritten = 300000;
net.bufferSize = 300000;

const folderName = path.relative('../', './');
//node KADpeer -p peerIP:portNum
let HOST = '127.0.0.1';
var PORT = Math.floor(Math.random()*55500) + 1000;
let joinOption = process.argv[2];
let tempDHT;
let peerCredentials = process.argv[3];
let peerIP, peerPort, peerID;
var dhtTable = [];

let client = new net.Socket();
let first = false;
let data = false;
//need to call SINGLETON.init() at some point to initialize all the values
if (singleton.getTimestamp() == null){
    singleton.init();
}
if (joinOption != '-p'){
    //start as a server
    //do not worry about being a client... you are the host server now
    //everyone wants to connect to you
    let thisAddr = `${HOST}:${PORT}`;
    pushBucket(dhtTable, thisAddr)  //add ourselves to the peer table, that way the clients will get our info
    let p2pHost = net.createServer();
    p2pHost.listen(PORT, HOST, ()=>{
        console.log(`This peer address is ${HOST}:${PORT} located at ${folderName} [${singleton.getPeerID(HOST, PORT)}]\n`);
    });
    
    p2pHost.on('connection', function(sock){
        //console.log('connected to someone');
        let sockAddr = `${sock.remoteAddress}:${sock.remotePort}`;
        // console.log(sock.bytesRead)
        // if(sock.bytesRead >= 4*4) handleSecondClientJoin(sock, sockAddr);
        // if(sock.bytesRead < 4*4) 
        handleClientJoin(sock, sockAddr);
    });
    // p2pHost.on('data', (data)=>{
    //     // console.log('i got some data?');
    // })
    p2pHost.on('end', function(sock){

    });
}
else{
    //we are client
    //we should connect to the peer in our command line
    let t = peerCredentials.split(':');
    peerIP = t[0];
    peerPort = parseInt(t[1]);
    
    // let client = new net.Socket();
    //let p2pListener = new net.createServer();
    //this.client = client;
    //setClientInformation(client);

    client.connect(peerPort, peerIP, function () {
        //HOST = client.localAddress;
        HOST = '127.0.0.1';
        PORT = client.localPort;
    //pushBucket(dhtTable, peerCredentials);  //add the peer we are connecting to into our kbucket
    //client.write('hello');
    });
        
    client.on('data', (data)=>{
        //console.log(data);
        //console.log(noNullDHT());
        //now when we receieve a packet, we need to handle it
        handleKADPacket(data);
        //console.log(noNullDHT());
        //if the dht table is updated, then send hello packet to all peers in the dht table
        
        //sendHello(noNullDHT());
        //client.end();
        tempDHT = noNullDHT();
        sendHello1(tempDHT);
        if(first) client.end();
    } );

    client.on('end', function(){
    })

    client.on('close', function(){
        //sendHello(noNullDHT());
        // setTimeout(() => { 
            // tempDHT = noNullDHT();
            // sendHello1(tempDHT);
            
             
            // // setTimeout(() => { 
                let p2pListener = net.createServer();
                p2pListener.listen(PORT, HOST, ()=>{console.log(`${HOST}:${PORT} is now a server`)});
        
                p2pListener.on('connection', function(sock){
                    //console.log(`connected from ${sock.remoteAddress}:${sock.remotePort}`);
                    handleSecondClientJoin(sock);
                });
                p2pListener.on('error', (e) => {
                    if (e.code === 'EADDRINUSE') {
                      console.error('Address in use, retrying...');
                      setTimeout(() => {
                        p2pListener.close();
                        p2pListener.listen(PORT, HOST);
                      }, 1000);
                    }
                });
            // }, 1600);
        // }, 600);
    });
    
//    p2pListener.listen(PORT, HOST, ()=>{console.log(`${HOST}:${PORT} is now a server`)});

//    p2pListener.on('connection', function(sock){
//        console.log(`connected from ${sock.remoteAddress}:${sock.remotePort}`);
//        //handleClientJoin(sock);
//    });
//    p2pListener.on('data', (data)=>{
//        console.log('i got some data?');
//        handleKADPacket(data);
//    })

    // if(client.destroyed || client.closed){
    //     sendHello(noNullDHT());

    //     let p2pListener = net.createServer();
    //     p2pListener.listen(PORT, HOST, ()=>{console.log(`${HOST}:${PORT} is now a server`)});

    //     p2pListener.on('connection', function(sock){
    //         console.log(`connected from ${sock.remoteAddress}:${sock.remotePort}`);
    //         //handleClientJoin(sock);
    //     });
    //     p2pListener.on('data', (data)=>{
    //         console.log('i got some data?');
    //         handleKADPacket(data);
    //     })
    // }

}



// function setClientInformation(a){
//     CLIENT_SOCK = a;
// }



function handleKADPacket(data){
    //let bData = singleton.Hex2Bin(data);

    let version = parseBitPacket(data, 0, 4);
    let msgType = parseBitPacket(data, 4, 8);
    let numberOfPeers = parseBitPacket(data, 12, 8);
    let senderNameLength = parseBitPacket(data, 20, 12);
    const name = new Buffer.alloc(senderNameLength)
    data.copy(name, 0, 4, senderNameLength*8)
    let senderName = bytesToString(name)
    console.log(msgType)
    if (version != 7){  //leave the subroutine if the version isnt 7
        return;
    }

    let tempArr = [];
    const r = senderNameLength % 4;
    const payloadOffset = ((4+senderNameLength) + (r===0?r:(4-r)))*8;
    if (numberOfPeers > 0){ //if there are peers in the packet, get the info and store in an array
        for (let i = 0; i < numberOfPeers; i++){
            let ip0 = parseBitPacket(data, payloadOffset + 64*i, 8);
            let ip8 = parseBitPacket(data, payloadOffset + 8 + 64*i, 8);
            let ip16 = parseBitPacket(data, payloadOffset + 16 + 64*i, 8);
            let ip24 = parseBitPacket(data, payloadOffset + 24 + 64*i, 8);
            let portNumber = parseBitPacket(data, payloadOffset + 64*i + 32, 16);
            tempArr[i] = `${ip0}.${ip8}.${ip16}.${ip24}:${portNumber}`;
            //pushBucket(dhtTable, peerAddressAndPort);
        }
        
    }
    console.log(tempArr)

    
    if (msgType == 1){
        //its a welcome message
        tempArr.reverse();
        console.log(`Connected to ${senderName}:${peerPort} at timestamp: ${singleton.getTimestamp()}`);
        console.log(`This peer address is ${HOST}:${PORT} located at ${folderName} [${singleton.getPeerID(HOST, PORT)}]`);
        let dTable = '[]'
        if(tempArr.length > 1){
            // dTable = tempArr.slice(0, tempArr.length-1);
            dTable = formatTableOutput(tempArr.slice(1)); 
        }
        console.log(`Received a welcome message from ${senderName}\n   along with DHT: ${dTable}`);
    }else if (msgType == 2){
        //its a hello message
        //pushBucket(dhtTable, tempArr[0])
    }
    if (numberOfPeers > 0){
        refreshBuckets(dhtTable, tempArr);  //call the refresh buckets method with the array
    }
}

//for output of the receieved DHT table in a welcome or hello message
function formatTableOutput(T){
    let s = '';
    for (let i = 0; i < T.length; i++){
        let ip = T[i].split(':')[0];
        let port = T[i].split(':')[1];
        s += `[${T[i]}, ${singleton.getPeerID(ip, port)}]\n                   `;
    }
    return s;
}

function refreshBuckets(T, LIST){
    for (let i = 0; i < LIST.length; i++){
        pushBucket(T, LIST[i]); //cycle through each peer in the list and pushBucket it
    }
    //also need to output the DHT table afterwards!
    console.log('Refresh k-Bucket operation is performed.\n');
    let s = 'My DHT: ';
    let tempT = noNullDHT();
    for (let i = 0; i < tempT.length; i++){
        s+= `[${tempT[i]}]\n        `;
    }
    console.log(s);
}

function sendHello(T){
    //console.log(this.client.localAddress);
    //console.log(this.client.localPort);
    //send data to every client in your DHT table (but dont double connect to them)
    for (let i = 0; i < T.length; i++){
        // peerIP = peerCredentials.split(':')[0]
        // peerPort = peerCredentials.split(':')[1]
        let checkForHost = `${peerCredentials}, ${singleton.getPeerID(peerIP, peerPort)}`;

        if (T[i] != checkForHost){
            let ipAndPort = T[i].split(",")[0];
            let ip = ipAndPort.split(':')[0];
            let port = parseInt(ipAndPort.split(':')[1]);
            let pkt = cPTP;
            let d = [];
            d[0] = `${port}:${ip}, ${singleton.getPeerID(ip, port)}`;
            pkt.init(7, 2, d.length, folderName.length, folderName, d);
            //let c = CLIENT_SOCK;
            //c.write(pkt.getBytePacket());
            try{
                let a = new net.Socket()
                a.connect({port:port, host:ip, localAddress:HOST, localPort:PORT}, ()=>{
                    a.write(pkt.getBytePacket(), (err)=>{
                        a.end();
                        console.log(`written to:  ${port}`)
                    });
                })

             
            } catch(e){
                console.error(e);
            }
            /*
            c.connect(port, ip, function(){
                let pkt = cPTP;
                let d = [];
                d[0] = `${port}:${ip}, ${singleton.getPeerID(port, id)}`;
                pkt.init(7, 2, 1, 0, 0, d);
                c.write(pkt.getBytePacket());
                sent = true;
            });*/
            
            
        }
    }
    console.log('Hello packet has been sent.')
}


function sendHello1(T){
    // let checkForHost = `${peerCredentials}, ${singleton.getPeerID(peerIP, peerPort)}`;

    
    // if (T[0] == checkForHost){
    //     T.shift()
    // }
    if (T.length <= 0) return first=true;
    console.log(T)
    console.log(T[0])
    //if (T[0] != checkForHost ){
        let ipAndPort = T[0].split(",")[0];
        let ip = ipAndPort.split(':')[0];
        let port = parseInt(ipAndPort.split(':')[1]);
        let pkt = cPTP;
        let d = [];
        d[0] = `${ip}:${port}, ${singleton.getPeerID(ip, port)}`;
        pkt.init(7, 2, d.length, folderName.length, folderName, d);

        try{
            let a = new net.Socket()
            // a.connect({port:port, host:ip, localAddress:HOST, localPort:PORT}, ()=>{
            a.connect(port, ip, ()=>{
                a.write(pkt.getBytePacket(), (err)=>{
                    a.destroy();
                    console.log(`written to:  ${port} :: ${T.length}`)
                    if(T.length > 0){
                        T.shift()
                        sendHello1(T)
                    }
                    if(T.length <= 0) {
                        first = false;
                        console.log('all hellos sent')
                        return client.end()
                    }

                });
            })
        } catch(e){
            console.error(e);
        }
    //}
    
    console.log('Hello packet has been sent.')
}

function handleSecondClientJoin(sock, sockAddr){
    //let sockAddr = `${sock.remoteAddress}:${sock.remotePort}`;
    console.log(`Connected from peer ${sockAddr}`);

    sock.on('data', (data)=>{
        handleKADPacket(data);
    })
}

function handleClientJoin(sock, sockAddr){
    //sock.localport to determine the port #?
    //or we can get it from a packet?
    //assignClientName(sock, nickNames);
    //add them to the DHT table as well.
    

    //let sockAddr = `${sock.remoteAddress}:${sock.remotePort}`;
    console.log(`Connected from peer ${sockAddr}`);
    //check our dht table
    //let sockID = singleton.getPeerID(sock.remoteAddress, sock.remotePort);

    //dht table: ip:port, hashed peerID
    //send a welcome message packet
    let pkt = cPTP;
    //pkt.init(7, 1, /*numPeers, senderNameLength, senderName, IP, Port, then paylod */);
    //sender name is no longer used, so I am not including it (Ouda updated assignment)
    pkt.init(7, 1, DHTTableLength(), folderName.length, folderName, noNullDHT());
    sock.write(pkt.getBytePacket());
    //printPacketBit(pkt.getBytePacket());
    pushBucket(dhtTable, sockAddr); //this must come after we send the message.
}

function pushBucket(T, P){
    let pip = P.split(':')[0];
    let pport = P.split(':')[1];
    //check similar bits between the new connex and our id
    let pid = singleton.getPeerID(pip, pport);
    let serverID = singleton.getPeerID(HOST, PORT); //this is the ID of whatever peer we are currently on
    let pbits = singleton.Hex2Bin(pid);
    let sbits = singleton.Hex2Bin(serverID);

    let storeIndex = 0;
    let xor = singleton.XORing(pbits, sbits);
    //if bits match, then the xor will be a 0
    //so we can just split the xor at the first 1, and then determine its length
    storeIndex = xor.split('1')[0].length - 1;
    //check if there is already something in that index
    if (dhtTable[storeIndex] != null){
        //compare the distance between the host node(that has the table), the node currently in table, and the node that wants to be in the table
        let dhtID = dhtTable[storeIndex].split(',')[1];
        dhtID.replace(' ', '');
        let dhtBits = singleton.Hex2Bin(dhtID);
        let res1 = singleton.XORing(sbits, dhtBits);   //get the distances and store them
        let res2 = singleton.XORing(sbits, pbits);
        //now i can compare the distances with another XOR. 
        //where there is a 1, that is the index that has a different bit.
        //if we check that index on both res1 and res2, we can find which one has a larger distance.
        let checker = singleton.XORing(res1, res2);
        let checkIndex = checker.split('1');
        checkIndex = checkIndex[0].length - 1;
        if (res2.charAt(checkIndex) == 0){
            //this distance is smaller, we should add it to the table
            console.log(`${pip}:${pport}, [${pid}] has replaced\n${dhtTable[storeIndex]}`)
            dhtTable[storeIndex] = `${pip}:${pport}, ${pid}`;
        }//otherwise, the other distance is smaller, so we shouldn't update the table at all
        else{
            //since we didn't update the table at all, we will do nothing! But if the table changed, then we should send hello packet.
        }

    }else{
        dhtTable[storeIndex] = `${pip}:${pport}, ${pid}`;   //if the table is empty here, add it.
    }

    //console.log(noNullDHT());
    //updateDHTTable(pip, pport, T);  //i created this function before knowing how to do pushBucket
    //this function is staying because its very helpful and works properly
}

function DHTTableLength(){
    let numPeers = 0;
    for (let i = 0; i < dhtTable.length; i++){
        if (dhtTable[i] != null){
            numPeers++;
        }
    }
    return numPeers;
}

function noNullDHT(){
    let storeDHT = [];
      let a = 0;  //make sure the dht table has no null values
      for (let i = 0; i < dhtTable.length; i++){
        if (dhtTable[i]!= null){
          storeDHT[a] = dhtTable[i];
          a++;
        }
      }
    return storeDHT;
}

// function updateDHTTable(pip, pport, table){
//     //check similar bits between the new connex and our id
//     let pid = singleton.getPeerID(pip, pport);
//     let serverID = singleton.getPeerID(HOST, PORT); //this is the ID of whatever peer we are currently on
//     let pbits = singleton.Hex2Bin(pid);
//     let sbits = singleton.Hex2Bin(serverID);

//     let storeIndex = 0;
//     let xor = singleton.XORing(pbits, sbits);
//     //if bits match, then the xor will be a 0
//     //so we can just split the xor at the first 1, and then determine its length
//     storeIndex = xor.split('1')[0].length - 1;
//     //check if there is already something in that index
//     if (dhtTable[storeIndex] != null){
//         //compare the distance between the host node(that has the table), the node currently in table, and the node that wants to be in the table
//         let dhtID = dhtTable[storeIndex].split(',')[1];
//         dhtID.replace(' ', '');
//         let dhtBits = singleton.Hex2Bin(dhtID);
//         let res1 = singleton.XORing(sbits, dhtBits);   //get the distances and store them
//         let res2 = singleton.XORing(sbits, pbits);
//         //now i can compare the distances with another XOR. 
//         //where there is a 1, that is the index that has a different bit.
//         //if we check that index on both res1 and res2, we can find which one has a larger distance.
//         let checker = singleton.XORing(res1, res2);
//         let checkIndex = checker.split('1');
//         checkIndex = checkIndex[0].length - 1;
//         if (res2.charAt(checkIndex) == 0){
//             //this distance is smaller, we should add it to the table
//             dhtTable[storeIndex] = `${pip}:${pport}, ${pid}`;
//         }//otherwise, the other distance is smaller, so we shouldn't update the table at all
//         else{
//             //since we didn't update the table at all, we will do nothing! But if the table changed, then we should send hello packet.
//         }

//     }else{
//         dhtTable[storeIndex] = `${pip}:${pport}, ${pid}`;   //if the table is empty here, add it.
//     }

//     //console.log(noNullDHT());
// }




//helper functions from assignment1 
function parseBitPacket(packet, offset, length) {
    let number = "";
    for (var i = 0; i < length; i++) {
      // let us get the actual byte position of the offset
      let bytePosition = Math.floor((offset + i) / 8);
      let bitPosition = 7 - ((offset + i) % 8);
      let bit = (packet[bytePosition] >> bitPosition) % 2;
      number = (number << 1) | bit;
    }
    return number;
  }

// Converts byte array to string
function bytesToString(array) {
    var result = "";
    for (var i = 0; i < array.length; ++i) {
        result += String.fromCharCode(array[i]);
    }
    return result;
}

// Prints the entire packet in bits format
function printPacketBit(packet) {
    var bitString = "";
  
    for (var i = 0; i < packet.length; i++) {
      // To add leading zeros
      var b = "00000000" + packet[i].toString(2);
      // To print 4 bytes per line
      if (i > 0 && i % 4 == 0) bitString += "\n";
      bitString += " " + b.substr(b.length - 8);
    }
    console.log(bitString);
  }