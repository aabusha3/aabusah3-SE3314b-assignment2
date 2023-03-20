var version, messageType, numPeers, senderNameLength, senderName, peerAddress, peerPort;

module.exports = {
    header: "", //Bitstream of the ITP header
    payload: "", //Bitstream of the ITP payload
  
    init: function (ver, msgType, nPeers, sNameLength, sName, data) {
      //fill by default packet fields:
        
      //build the header bistream:
      //--------------------------
      const headerSize = 4+sNameLength;
      const r = headerSize % 4;
      this.header = new Buffer.alloc(headerSize + (r===0?r:(4-r)));
      
      storeBitPacket(this.header, ver, 0, 4);//add response type
      
      storeBitPacket(this.header, msgType, 4, 8);// add message type
      
      storeBitPacket(this.header, nPeers, 12, 8);// number of peers
      
      storeBitPacket(this.header, sNameLength, 20, 12);//sender name length
      
      //sender name could be many more bits. We need to determine that based off the length.
      //ouda says we dont use sender name anymore. I leave this all 0s
      for (let i = 0; i < sNameLength; i++)//store image name in a dynamic fashion
        storeBitPacket(this.header, sName.charCodeAt(i), 32+(8*i), 8);
        
      //const headerEndOffset = Math.abs(64-(headerSize*8));
      //storeBitPacket(this.header, 0, 32+(8*sNameLength), 32-headerEndOffset);

      //then we must store the ip and ports of all the peers in the dht table
      //fill the payload bitstream:
      //const payloadStartOffset = (32+(8*sNameLength)) + (32-headerEndOffset)
      this.payload = new Buffer.alloc(nPeers*8); //*8 because there are 2 bytes that will be all 0s after peer port number

      if(nPeers > 0){
        for (let i = 0; i < nPeers; i++){
          let peerAddressAndPort = data[i].split(',')[0];
          let peerIP = peerAddressAndPort.split(':')[0].split('.');
          let ip0 = parseInt(peerIP[0]);
          let ip8 = parseInt(peerIP[1]);
          let ip16 = parseInt(peerIP[2]);
          let ip24 = parseInt(peerIP[3]);
          

          let peerPort = peerAddressAndPort.split(':')[1];
          
          storeBitPacket(this.payload, ip0, i*64, 8);//every 64 bits there is a new peerip:peerport
          storeBitPacket(this.payload, ip8, i*64 + 8, 8);
          storeBitPacket(this.payload, ip16, i*64 + 16, 8);
          storeBitPacket(this.payload, ip24, i*64 + 24, 8);

          storeBitPacket(this.payload, parseInt(peerPort), i*64 + 32, 16);  //peerport should be 4 bytes after the ip
          //storeBitPacket(this.payload, 0, i*64 + 48, 16); //fill the rest with 0
        }
      }
   
    },
  
    //--------------------------
    //getBytePacket: returns the entire packet in bytes
    //--------------------------
    getBytePacket: function () {
      let packet = new Buffer.alloc(this.header.length + this.payload.length);
      //construct the packet = header + payload
      for (var h = 0; h < this.header.length; h++)
        packet[h] = this.header[h];
      for (var p = 0; p < this.payload.length; p++)
        packet[p + this.header.length] = this.payload[p];
  
      return packet;
    },
  };
  
  // Store integer value into the packet bit stream
  function storeBitPacket(packet, value, offset, length) {
    // let us get the actual byte position of the offset
    let lastBitPosition = offset + length - 1;
    let number = value.toString(2);
    let j = number.length - 1;
    for (var i = 0; i < number.length; i++) {
      let bytePosition = Math.floor(lastBitPosition / 8);
      let bitPosition = 7 - (lastBitPosition % 8);
      if (number.charAt(j--) == "0") {
        packet[bytePosition] &= ~(1 << bitPosition);
      } else {
        packet[bytePosition] |= 1 << bitPosition;
      }
      lastBitPosition--;
    }
  }