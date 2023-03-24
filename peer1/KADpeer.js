let singleton = require('./singleton.js');
let cPTP = require('./kadPTP.js');
let net = require('net');
const path = require( "path" );

net.bytesWritten = 300000;
net.bufferSize = 300000;

const folderName = path.relative('..', '.');
const joinOp = process.argv[2];
const peerInfo = process.argv[3];
const ip = '127.0.0.1';
let myPort = Math.floor(Math.random()*55500) + 1000;

let dhtTable = [];
let dhtCopy = [];
let client = new net.Socket();

if (singleton.getTimestamp() == null)
    singleton.init();


if(joinOp != '-p') myCreateServer(myPort);
if(joinOp == '-p') myCreateSocket(peerInfo.split(':')[1])

async function myCreateServer(myPort){
    let server = net.createServer((sock)=>{
        if(joinOp != '-p') sendWelcome(sock);

        sock.on('data',(data)=>{
            readData(data);
        })
        sock.on('end',()=>{
            
        })
    })
    server.listen(myPort, ip, ()=>{
        if(joinOp != '-p') {
            console.log(`This peer address is ${ip}:${myPort} located at ${folderName} [${singleton.getPeerID(ip, myPort)}]\n`);
            pushBucket(dhtTable, ip+':'+myPort)
        }
        if(joinOp == '-p') console.log(`${ip}:${myPort} is now a server`);
    })
}

async function myCreateSocket(peerPort){
    client = net.createConnection({port:peerPort,host:ip,localAddress:ip},()=>{
        myPort = client.localPort;
    })
    client.on('data', (data)=>{
        readData(data);
        dhtCopy = noNullDHT();
        const index = dhtCopy.indexOf(`${ip}:${peerPort}, ${singleton.getPeerID(ip, peerPort)}`);
        if (index > -1) {
            dhtCopy.splice(index, 1); 
            let myDataToHost = [];
            myDataToHost[0] = `${ip}:${myPort}, ${singleton.getPeerID(ip, myPort)}`;
            let pkt = cPTP;
            pkt.init(7, 2, myDataToHost.length, folderName.length, folderName, myDataToHost);
            client.write(pkt.getBytePacket(), (err)=>{
                client.end();
                client.destroy();
            });
        }
        else {
            client.end();
            client.destroy();
        }
    })
    client.on('end', function(){
    })
    client.on('close', function(){
        sendHello(dhtCopy);
    })
}

async function sendWelcome(sock){
    const sockAddr = `${sock.remoteAddress}:${sock.remotePort}`;
    console.log(`Connected from peer ${sockAddr}`);
    const pkt = cPTP;
    const dht = noNullDHT();
    pkt.init(7, 1, dht.length, folderName.length, folderName, dht);
    sock.write(pkt.getBytePacket());
    pushBucket(dhtTable, sockAddr);
}

async function sendHello(T){
    if(T.length <= 0) {
        console.log('Hello packet has been sent');
        return myCreateServer(myPort);
    }

    let pkt = cPTP;
    let myData = [];
    myData[0] = `${ip}:${myPort}, ${singleton.getPeerID(ip, myPort)}`;
    pkt.init(7, 2, myData.length, folderName.length, folderName, myData);

    //let host = `${peerInfo}, ${singleton.getPeerID(ip, peerInfo.split(':')[1])}`;
    console.log(`${T}`)
    let port = parseInt(T[0].split(",")[0].split(':')[1]);

    console.log(`connect`)
    let cli = new net.Socket();
    cli.connect({port:port,host:ip,localAddress:ip,localPort:myPort}, ()=>{
        console.log(`connect to ${port}`)
        cli.write(pkt.getBytePacket(), (err)=>{
            cli.destroy();
            T.splice(0,1)
            if(T.length <= 0) {
                console.log('Hello packet has been sent');
                return myCreateServer(myPort);
            }
            else{
                sendHello(T);
            }
        });
    });

}


async function readData(data){
    let version = parseBitPacket(data, 0, 4);
    let msgType = parseBitPacket(data, 4, 8);
    let numberOfPeers = parseBitPacket(data, 12, 8);
    let senderNameLength = parseBitPacket(data, 20, 12);
    let senderName = new Buffer.alloc(senderNameLength)
    data.copy(senderName, 0, 4, senderNameLength*8)
    senderName = bytesToString(senderName)

    console.log(msgType)
    if (version != 7) return console.log(`version number provided '${version}' !== 7`);

    let dataArr = [];
    const r = senderNameLength % 4;
    const payloadOffset = ((4+senderNameLength) + (r===0?r:(4-r)))*8;
    if (numberOfPeers > 0){ 
        for (let i = 0; i < numberOfPeers; i++){
            let ip0 = parseBitPacket(data, payloadOffset + 64*i, 8);
            let ip8 = parseBitPacket(data, payloadOffset + 8 + 64*i, 8);
            let ip16 = parseBitPacket(data, payloadOffset + 16 + 64*i, 8);
            let ip24 = parseBitPacket(data, payloadOffset + 24 + 64*i, 8);
            let portNumber = parseBitPacket(data, payloadOffset + 64*i + 32, 16);
            dataArr[i] = `${ip0}.${ip8}.${ip16}.${ip24}:${portNumber}`;
        }
    }
    console.log(dataArr)

    let dTable = '[]'
    if(dataArr.length > 1) dTable = formatTableOutput(dataArr.reverse().slice(1)); 

    if (msgType == 1){
        console.log(`Connected to ${senderName}:${dataArr[0].split(':')[1]} at timestamp: ${singleton.getTimestamp()}`);
        console.log(`This peer address is ${ip}:${myPort} located at ${folderName} [${singleton.getPeerID(ip, myPort)}]`);
        console.log(`Received a welcome message from ${senderName}\n   along with DHT: ${dTable}`);
    }
    else if (msgType == 2)
        console.log(`Received a hello message from ${senderName}\n   along with DHT: ${dTable}`);
    

    refreshBuckets(dhtTable, dataArr.reverse());
}



function refreshBuckets(T, Pn){
    for (let i = 0; i < Pn.length; i++) pushBucket(T, Pn[i]); 

    console.log('Refresh k-Bucket operation is performed.\n');
    let str = 'My DHT: ';
    let tempT = noNullDHT();
    console.log(tempT)
    for (let i = 0; i < tempT.length; i++) str+= `[${tempT[i]}]\n        `;

    console.log(str);
}

function noNullDHT(){
    let dhtEntries = [];
      let e = 0;

      for (let t = 0; t < dhtTable.length; t++)
        if (dhtTable[t]!= null){
          dhtEntries[e] = dhtTable[t];
          e++;
        }
      
    return dhtEntries;
}

function pushBucket(T, P){
    let pIP = P.split(':')[0];
    let pPORT = P.split(':')[1];

    let pID = singleton.getPeerID(pIP, pPORT);
    let myID = singleton.getPeerID(ip, myPort);

    let pBITS = singleton.Hex2Bin(pID);
    let myBITS = singleton.Hex2Bin(myID);

    let xor = singleton.XORing(pBITS, myBITS);
    let index = xor.split('1')[0].length - 1;

    if (T[index] != null){
        let dhtID = T[index].split(',')[1].replace(' ', '');
        let dhtBITS = singleton.Hex2Bin(dhtID);

        let dif1 = singleton.XORing(myBITS, dhtBITS);   
        let dif2 = singleton.XORing(myBITS, pBITS);
        
        xor = singleton.XORing(dif1, dif2);
        let difIndex = xor.split('1')[0].length - 1;
        if (dif2.charAt(difIndex) == 0){
            console.log(`${pIP}:${pPORT}, [${pID}] has replaced\n${T[index]}`)
            T[index] = `${pIP}:${pPORT}, ${pID}`;
        }
    }
    else T[index] = `${pIP}:${pPORT}, ${pID}`; 
}

function formatTableOutput(table){
    let str = '';
    for (let i = 0; i < table.length; i++){
        let ip = table[i].split(':')[0];
        let port = table[i].split(':')[1];
        str += `[${table[i]}, ${singleton.getPeerID(ip, port)}]\n                   `;
    }
    return str;
}


function parseBitPacket(packet, offset, length) {
    let number = "";

    for (var i = 0; i < length; i++) {
      let bytePosition = Math.floor((offset + i) / 8);
      let bitPosition = 7 - ((offset + i) % 8);
      let bit = (packet[bytePosition] >> bitPosition) % 2;
      number = (number << 1) | bit;
    }

    return number;
  }

function bytesToString(array) {
    var result = "";
    for (var i = 0; i < array.length; ++i) result += String.fromCharCode(array[i]);
    return result;
}