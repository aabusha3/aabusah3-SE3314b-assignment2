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
        pushBucket(dhtTable, ip+':'+sock.remotePort);

        sock.on('data',(data)=>{
            readData(data, sock);
        })
        sock.on('end',()=>{
            
        })
    })
    server.listen(myPort, ip, ()=>{
        if(joinOp != '-p') console.log(`This peer address is ${ip}:${myPort} located at ${folderName} [${singleton.getPeerID(ip, myPort)}]\n`);
        if(joinOp == '-p') console.log(`${ip}:${myPort} is now a server`);
    })
}

async function myCreateSocket(peerPort){
    client = net.createConnection({port:peerPort,host:ip,localAddress:ip},()=>{
        myPort = client.localPort;
        pushBucket(dhtTable, ip+':'+peerPort)
    })
    client.on('data', (data)=>{
        readData(data, client);
        dhtCopy = noNullDHT();
        const index = dhtCopy.indexOf(`${ip}:${peerPort}, ${singleton.getPeerID(ip, peerPort)}`);
        if (index > -1) {
            dhtCopy.splice(index, 1); 
            let pkt = cPTP;
            let fullDHT = noNullDHT();
            pkt.init(7, 2, fullDHT.length, folderName.length, folderName, fullDHT);
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
}

async function sendHello(T){
    if(T.length <= 0) {
        console.log('Hello packet has been sent');
        return myCreateServer(myPort);
    }

    let port = parseInt(T[0].split(",")[0].split(':')[1]);

    let cli = new net.Socket();
    cli.connect({port:port,host:ip,localAddress:ip,localPort:myPort}, ()=>{
        let pkt = cPTP;
        let fullDHT = noNullDHT();
        pkt.init(7, 2, fullDHT.length, folderName.length, folderName, fullDHT);
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
    cli.on('error', (err) => {
        if(err.code == 'ECONNREFUSED') console.log(`Client is no longer listening on ${err.address}:${err.port}`)
        else console.log(`handled error:\n${err}`);
        console.log(`error has been detected please restart all peer nodes`)
    });

}


async function readData(data, sock){
    const loc = sock.localPort;
    const rem = sock.remotePort;
    let version = parseBitPacket(data, 0, 4);
    let msgType = parseBitPacket(data, 4, 8);
    let numberOfPeers = parseBitPacket(data, 12, 8);
    let senderNameLength = parseBitPacket(data, 20, 12);
    let senderName = new Buffer.alloc(senderNameLength)
    data.copy(senderName, 0, 4, senderNameLength*8)
    senderName = bytesToString(senderName)

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

    let dTable = []
    let index = dataArr.indexOf(`${ip}:${rem}`);
    if (index > -1) {
        dTable = formatTableOutput(dataArr.slice(0,index).concat(dataArr.slice(index+1,dataArr.length)));
    }
    else dTable = formatTableOutput(dataArr)    
    
    if (msgType == 1){
        console.log(`Connected to ${senderName}:${rem} at timestamp: ${singleton.getTimestamp()}`);
        console.log(`This peer address is ${ip}:${loc} located at ${folderName} [${singleton.getPeerID(ip, loc)}]`);
        console.log(`Received a welcome message from ${senderName}\n   along with DHT: ${dTable.length===0?'[]':dTable}`);
    }
    else if (msgType == 2)
        console.log(`Received a hello message from ${senderName}\n   along with DHT: ${dTable.length===0?'[]':dTable}`);
    
    index = dataArr.indexOf(`${ip}:${loc}`);
    if(index > -1) dataArr.splice(index,1)
    refreshBuckets(dhtTable, dataArr);
}



function refreshBuckets(T, Pn){
    for (let i = 0; i < Pn.length; i++) pushBucket(dhtTable, Pn[i]); 

    console.log('Refresh k-Bucket operation is performed.\n');
    let str = 'My DHT: ';
    let tempT = noNullDHT();
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
    let index = xor.split('1')[0].length;

    if (T[index] != null){
        if(T[index] == `${ip}:${pPORT}, ${pID}`)return;
        let dhtID = T[index].split(',')[1].replace(' ', '');
        let dhtBITS = singleton.Hex2Bin(dhtID);

        let dif1 = singleton.XORing(myBITS, dhtBITS);   
        let dif2 = singleton.XORing(myBITS, pBITS);
        
        xor = singleton.XORing(dif1, dif2);
        let difIndex = xor.split('1')[0].length;
        if (dif2.charAt(difIndex) == 0){
            console.log(`${pIP}:${pPORT}, [${pID}] has replaced\n${T[index]} since its closer`)
            T[index] = `${pIP}:${pPORT}, ${pID}`;
        }
        else if (dif1.charAt(difIndex) == 0)           
            console.log(`${T[index]} has replaced\n${pIP}:${pPORT}, [${pID}] since its closer`);

        else console.log(`something went wrong`);
    }
    else {
        T[index] = `${pIP}:${pPORT}, ${pID}`;
    }
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