Inorder for this to run properly, 1 peer must be declaired a host peer by running node KADpeer without any arguments
Wait for client to announce itself to be a server before running the command to join new peers, announcement looks like: '127.0.0.1:XXXXX is now a server'
singleton.js has been change to enforece m=160 instead of m=320
Create as many host folders as m=160