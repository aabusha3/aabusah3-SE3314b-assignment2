let singleton = require('./singleton.js');//misc randomizer functions and timer
let cPTP = require('./kadPTP.js');//packet formater
let net = require('net');//to allow packet sending
const path = require( "path" );//to get the folder name

net.bytesWritten = 300000;//size of packets alloted to be written
net.bufferSize = 300000;//size of buffer

const folderName = path.relative('..', '.');//the folder name
const joinOp = process.argv[2];//join flag or null
const peerInfo = process.argv[3];//host peer info or null
const ip = '127.0.0.1';//the set ip
let myPort = singleton.getPort();//get random port

let dhtTable = [];//the proper dht table with 160 k-buckets
let dhtCopy = [];//a copy of the dht table to exahust
let client = new net.Socket();//the client socket

if (singleton.getTimestamp() == null) singleton.init();//start timer

if(joinOp != '-p') myCreateServer(myPort);//create server
if(joinOp == '-p') myCreateSocket(peerInfo.split(':')[1]);//create client

//--------------------------
//myCreateServer: takes a port and creates a server to listen on that port and carry out server operations
//--------------------------
async function myCreateServer(myPort){
    let server = net.createServer((sock)=>{
        if(joinOp != '-p') sendWelcome(sock);//sent to new clients
        pushBucket(dhtTable, ip+':'+sock.remotePort);//add the client to server's dht

        sock.on('data',(data)=>{
            readData(data, sock);//interpret hello packets
        })
    })
    server.listen(myPort, ip, ()=>{//start listening on this port
        if(joinOp != '-p') console.log(`This peer address is ${ip}:${myPort} located at ${folderName} [${singleton.getPeerID(ip, myPort)}]\n`);
        if(joinOp == '-p') console.log(`${ip}:${myPort} is now a server\n`);
    })
}


//--------------------------
//myCreateSocket: takes a port and creates a client to listen on that port and carry out client operations
//--------------------------
async function myCreateSocket(peerPort){
    client = net.createConnection({port:peerPort,host:ip,localAddress:ip},()=>{
        myPort = client.localPort;
        pushBucket(dhtTable, ip+':'+peerPort)//add the host server to the client's dht
    })
    client.on('data', (data)=>{
        readData(data, client);//interpret welcome packets
        dhtCopy = noNullDHT();
        const index = dhtCopy.indexOf(`${ip}:${peerPort}, ${singleton.getPeerID(ip, peerPort)}`);
        if (index > -1) {//send hello packet to host server
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
    client.on('close', function(){
        sendHello(dhtCopy);//send hello packets to all remaining non-host servers listed on the client's dht
    })
}

//--------------------------
//sendWelcome: takes a socket and creates a welcome packet containing all the host server's dht peers
//--------------------------
async function sendWelcome(sock){
    const sockAddr = `${sock.remoteAddress}:${sock.remotePort}`;
    console.log(`Connected from peer ${sockAddr}`);
    const pkt = cPTP;
    const dht = noNullDHT();
    pkt.init(7, 1, dht.length, folderName.length, folderName, dht);
    sock.write(pkt.getBytePacket());
}

//--------------------------
//sendHello: takes a dht table and sends hello packets to all the client's dht peers who are non-host
//--------------------------
async function sendHello(T){
    if(T.length <= 0) {//all peers have been notified; become server
        console.log('Hello packet has been sent');
        return myCreateServer(myPort);
    }

    let port = parseInt(T[0].split(",")[0].split(':')[1]);//the port we are trying to send to

    let cli = new net.Socket();
    cli.connect({port:port,host:ip,localAddress:ip,localPort:myPort}, ()=>{
        let pkt = cPTP;
        let fullDHT = noNullDHT();
        pkt.init(7, 2, fullDHT.length, folderName.length, folderName, fullDHT);
        cli.write(pkt.getBytePacket(), (err)=>{
            cli.destroy();
            T.splice(0,1);
            if(T.length <= 0) {//all peers have been notified; become server
                console.log('Hello packet has been sent');
                return myCreateServer(myPort);
            }
            else sendHello(T);//loop til all peers on the dht table have been sent hello packets 
        });
    });
    cli.on('error', (err) => {//error handling
        if(err.code == 'ECONNREFUSED') console.log(`Client is no longer listening on ${err.address}:${err.port}`)
        else console.log(`handled error:\n${err}`);
        console.log(`error has been detected please restart all peer nodes`)
    });
}

//--------------------------
//readData: takes socket and data from that socket to interpret the custom TCP packet
//--------------------------
async function readData(data, sock){
    const loc = sock.localPort;//our port
    const rem = sock.remotePort;//the packet sender's port
    let version = parseBitPacket(data, 0, 4);//the version num; must be 7
    let msgType = parseBitPacket(data, 4, 8);//the message type num; must be either 1 or 2
    let numberOfPeers = parseBitPacket(data, 12, 8);//number of peers on sender's dht table
    let senderNameLength = parseBitPacket(data, 20, 12);//length of sender's name
    let senderName = new Buffer.alloc(senderNameLength)//the name translated from n bytes
    data.copy(senderName, 0, 4, senderNameLength*8)
    senderName = bytesToString(senderName)

    if (version != 7) return console.log(`version number provided '${version}' !== 7`);

    let dataArr = [];
    const r = senderNameLength % 4;//add padding to read the packet correctly based on the sender's name length
    const payloadOffset = ((4+senderNameLength) + (r===0?r:(4-r)))*8;
    if (numberOfPeers > 0){ //payload
        for (let i = 0; i < numberOfPeers; i++){
            let ip0 = parseBitPacket(data, payloadOffset + 64*i, 8);
            let ip8 = parseBitPacket(data, payloadOffset + 8 + 64*i, 8);
            let ip16 = parseBitPacket(data, payloadOffset + 16 + 64*i, 8);
            let ip24 = parseBitPacket(data, payloadOffset + 24 + 64*i, 8);
            let portNumber = parseBitPacket(data, payloadOffset + 64*i + 32, 16);
            dataArr[i] = `${ip0}.${ip8}.${ip16}.${ip24}:${portNumber}`;
        }
    }

    let dTable = [];//correctly format and display the recieved dht peers 
    let index = dataArr.indexOf(`${ip}:${rem}`);
    if (index > -1) dTable = formatTableOutput(dataArr.slice(0,index).concat(dataArr.slice(index+1,dataArr.length)));
    else dTable = formatTableOutput(dataArr); 
    
    if (msgType == 1){//for welcome packets
        console.log(`Connected to ${senderName}:${rem} at timestamp: ${singleton.getTimestamp()}`);
        console.log(`This peer address is ${ip}:${loc} located at ${folderName} [${singleton.getPeerID(ip, loc)}]`);
        console.log(`Received a welcome message from ${senderName}\n   along with DHT: ${dTable.length===0?'[]':dTable}`);
    }
    else if (msgType == 2)//for hello packets
        console.log(`Received a hello message from ${senderName}\n   along with DHT: ${dTable.length===0?'[]':dTable}`);
    
    
    index = dataArr.indexOf(`${ip}:${loc}`);
    if(index > -1) dataArr.splice(index,1);
    refreshBuckets(dhtTable, dataArr);//refresh the all k-buckets; ignore our port entry
}


//--------------------------
//refreshBuckets: takes dht table and array of peers to push them into the k-bucket and display updated bucket
//--------------------------
function refreshBuckets(T, Pn){
    for (let i = 0; i < Pn.length; i++) pushBucket(dhtTable, Pn[i]); 

    console.log('Refresh k-Bucket operation is performed.\n');
    let str = 'My DHT: ';
    let tempT = noNullDHT();
    for (let i = 0; i < tempT.length; i++) str+= `[${tempT[i]}]\n        `;

    console.log(str);
}

//--------------------------
//noNullDHT: returns a table without empty entries from the dht table
//--------------------------
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

//--------------------------
//pushBucket: takes a dht table and a peer to push a peer in the appropriate k-bucket based on xor distance
//--------------------------
function pushBucket(T, P){
    //peer info
    let pIP = P.split(':')[0];
    let pPORT = P.split(':')[1];

    //id of peer and us
    let pID = singleton.getPeerID(pIP, pPORT);
    let myID = singleton.getPeerID(ip, myPort);

    //binary representation of the above ids
    let pBITS = singleton.Hex2Bin(pID);
    let myBITS = singleton.Hex2Bin(myID);

    //the distance between the peer and us
    let xor = singleton.XORing(pBITS, myBITS);
    let index = xor.split('1')[0].length;

    if (T[index] != null){//if the k-bucket at index i is full
        if(T[index] == `${ip}:${pPORT}, ${pID}`)return;//ignore if its a dupelicate

        //get stored peers info
        let dhtID = T[index].split(',')[1].replace(' ', '');
        let dhtBITS = singleton.Hex2Bin(dhtID);

        //get the distances between me and both peers
        let dif1 = singleton.XORing(myBITS, dhtBITS);   
        let dif2 = singleton.XORing(myBITS, pBITS);
        
        //find the xor distance between the above distances
        xor = singleton.XORing(dif1, dif2);
        let difIndex = xor.split('1')[0].length;

        if (dif2.charAt(difIndex) == 0){//if new peer is closer
            console.log(`${pIP}:${pPORT}, [${pID}] has replaced\n${T[index]} since its closer\n`)
            T[index] = `${pIP}:${pPORT}, ${pID}`;
        }
        else if (dif1.charAt(difIndex) == 0)//if old peer is closer       
            console.log(`${T[index]} has replaced\n${pIP}:${pPORT}, [${pID}] since its closer\n`);

        else console.log(`something went wrong`);//for error handling purposes; should not be possible to reach this state
    }
    else//else push the peer in the empty appropirate k-bucket
        T[index] = `${pIP}:${pPORT}, ${pID}`;   
}

//--------------------------
//formatTableOutput: takes a dht table and formats it to match the output required
//--------------------------
function formatTableOutput(table){
    let str = '';

    for (let i = 0; i < table.length; i++){
        let ip = table[i].split(':')[0];
        let port = table[i].split(':')[1];
        str += `[${table[i]}, ${singleton.getPeerID(ip, port)}]\n                   `;
    }

    return str;
}

//--------------------------
//parseBitPacket: takes a packet, offest and length to interpret a selcet section of a custom network packet
//--------------------------
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

//--------------------------
//bytesToString: takes a buffer array and returns the word value stored in bytes
//--------------------------
function bytesToString(array) {
    var result = "";
    for (var i = 0; i < array.length; ++i) result += String.fromCharCode(array[i]);
    return result;
}