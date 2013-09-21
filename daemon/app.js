// npm install buffertools
// npm install socket.io
require('buffertools');

var AUTHPORT = 18080;
var WEBPORT = 9080;
var GAMEPORT = 9081;

var WHITELIST = ["88.191.109.120", "88.191.102.162", "88.191.104.162", "173.242.114.20","144.76.38.98","88.191.111.120"]; //only these game IPs are allowed to connect
var AUTHSERVER = "185.2.168.7";

//------

var net = require('net');

var io = require('socket.io').listen(WEBPORT);
io.set('log level', 1);
//io.set("origins","*");
 
var servers = {}; //sockets of game servers that are currently connected
var tokens = {}; //valid user tokens
var clients = {}; //authed web users

var userids = 0; //unique id for each web user (some steamids/tokens may not be unique to 1 user)

var nullbyte = Buffer(1);
nullbyte.clear();

net.Socket.prototype.SendTable = function(data) {
    try {
        var msg = JSON.stringify(data);
        var msg_z = new Buffer(msg.length + 1);
        msg_z[msg_z.length - 1] = 0; // Since it doesn't guarantee it's all zeroes...
        msg_z.write(msg);
        this.write(msg_z);
    } catch (e) {
        console.log('[GAME] ERROR: Couldn\'t send table: ' + e);
    }
}

//---AUTH SERVER---

console.log('[AUTH] Listening on port ' + AUTHPORT);

net.createServer(function(sock) {
    sock.setTimeout(5000, function() { sock.destroy(); });
    
    if ((sock.remoteAddress || sock._remoteAddress) != AUTHSERVER) {
        console.log('[AUTH] Rejected connection from ' + (sock.remoteAddress || sock._remoteAddress));
        sock.destroy();
        return;
    }
	
 	sock.on('error', function(err) {
		console.log('[AUTH] Error: ' + err);
	});
	
    sock.on('data', function(data) {
        try {
            var json = JSON.parse(data);
            
            //token, steamid, name
            if (json[0] && json[1] && json[2]) {
                tokens[json[0]] = { steamid: json[1], name: json[2] };
                console.log('[AUTH] Added token ' + json[0]);
            }
        } catch(e) {
            console.log('[AUTH] Received invalid data from ' + (sock.remoteAddress || sock._remoteAddress));
            sock.destroy();
        }
    });
}).listen(AUTHPORT, "0.0.0.0");

//---WEB SERVER---

function sendToServers(socketid, data) {
    for (server in io.sockets.manager.roomClients[socketid]) {
        if (server == "") continue; //ignore the catch-all socket.io room
        var srv = servers[server.substring(1)]; //substring to remove the start /
        if (srv) srv.socket.SendTable(data);
    }
}

function onDisconnect(socket) {
    socket.get('name', function(err, name) {
        if (!name)
            console.log('[WEB] ' + socket.handshake.address.address + ' disconnected');
        else
            socket.get('token', function(err, token) {
                if (clients[token]) {
                    sendToServers(socket.id, [ 'leave', clients[token].userid, clients[token].steamid ]);
                    socket.broadcast.emit('leave', { name: clients[token].name, steamid: clients[token].steamid });
                    
                    delete clients[token];
                    delete tokens[token];
                }
                console.log('[WEB] ' + name + ' disconnected');
            });
    });
}

console.log('[WEB] Listening on port ' + WEBPORT);

io.sockets.on('connection', function(socket) {
    console.log('[WEB] Received connection from ' + socket.handshake.address.address);
    
    var tokentimeout = setTimeout(function() {
        if (typeof socket.handshake === "undefined") //the client doesn't exist anymore
            return;
        else
            socket.disconnect();
    }, 5000); //if they haven't sent a token in 5 secs d/c them
    
    socket.on('token', function(token) {
        if (token && token.trim() != "" && tokens[token]) {
            clearTimeout(tokentimeout);
            clients[token] = tokens[token]; //copy the steamid and name into connected clients
            clients[token].userid = userids++;
            socket.set('token', token); //used when disconnecting
            socket.emit('ready');
        } else {
			console.log('[WEB] Disconnect due to invalid token: ' + socket.handshake.address.address );
            socket.emit('invalidtoken');
            socket.disconnect();
            return;
        }
        
        socket.set('name', clients[token].name, function() {
            socket.get('name', function(err, name) {
                console.log('[WEB] User ' + name + ' connected with id ' + clients[token].userid);
                
                var allusers = {}; //tell the client who's connected both on web and games
                
                for (client in clients)
                    allusers[clients[client].name] = clients[client].steamid;
                    
                for (server in servers) { //not working wat
                    for (client in servers[server].users) {
                        allusers[servers[server].users[client].name] = servers[server].users[client].steamid;
                    }
                }
                
                socket.emit('list', allusers);
                
                delete allusers;
                
                socket.join('1');
                socket.join('2');
                socket.join('3');
                
                sendToServers(socket.id, [ 'join', clients[token].userid, clients[token].steamid, clients[token].name, 1 ]); //last arg is team
                socket.broadcast.emit('join', { name: clients[token].name, steamid: clients[token].steamid });
                
                socket.on('join', function(data) {
                    socket.join(data);
                    console.log('[WEB] ' + name + ' subscribed to server ' + data);
                });
                
                socket.on('leave', function(data) {
                    socket.leave(data);
                    console.log('[WEB] ' + name + ' unsubscribed from server ' + data);
                });
                
                socket.on('message', function(message) {
                    if (message.trim() == "") return;
                    console.log('[WEB] ' + name + ' (' + socket.handshake.address.address + '): ' + message);

                    sendToServers(socket.id, [ 'say', clients[token].userid, message ]); //have to assume it was sent D:
                    
                    for (room in io.sockets.manager.roomClients[socket.id])
                        io.sockets.in(room).emit('chat', { name: name, steamid: clients[token].steamid, message: message });
                });
            });
        });
    });
    
    socket.on('error', function(err) {
        console.log('[GAME] ERROR: ' + err);
        
        onDisconnect(socket);
    });
    
    socket.on('disconnect', function() {
        onDisconnect(socket);
    });
});

//---GAME SERVER---

console.log('[GAME] Listening on port ' + GAMEPORT);

function serverfunc(sock) {
    console.log('[GAME] Received connection from ' + (sock.remoteAddress || sock._remoteAddress) + ':' + (sock.remotePort || sock._remotePort));
    
	sock.on('error', function(err) {
		console.log('[GAME] Error: ' + err);
	});
	
	if ((sock.remoteAddress || sock._remoteAddress) !== undefined && WHITELIST.indexOf((sock.remoteAddress || sock._remoteAddress)) == -1) {
        console.log('[GAME] Rejected connection from ' + (sock.remoteAddress || sock._remoteAddress));
        sock.destroy();
        return;
    }
    
    
    var logintimeout = setTimeout(function() { sock.destroy(); }, 5000);
    
    sock.endburst = false;
    var databuff = false;
    
    sock.on('data', function(chunk) {
        if (databuff)
            databuff = databuff.concat(chunk);
        else
            databuff = chunk;
        
        // Process each complete message
        while (databuff && databuff.length > 0) {
            var pos = databuff.indexOf(nullbyte);
            if (pos < 0) {
                console.log('[GAME] Data did not contain zero byte');
                break;
            }
            
            var msg = databuff.toString('utf8', 0, pos);
            
            if (pos + 1 < databuff.length)
                databuff = databuff.slice(pos + 1);
            else
                databuff = false;
            
            var data;
            
            try {
                data = JSON.parse(msg);
            } catch (e) {
                console.log('[GAME] Received invalid data from ' + (sock.remoteAddress || sock._remoteAddress) + ' (' + e + '): \'' + msg + '\'');
                sock.destroy();
                return;
            }
            
            var sendtype = data[0];
        
            switch (sendtype) {
                case 'hello':
                    var serverid = String(data[1]);
                    var serverpw = String(data[1]);
                    
                    clearTimeout(logintimeout);
                    sock.socket = sock;
                    sock.serverid = serverid;
                    
                    if (servers[sock.serverid] && servers[sock.serverid].socket)
                        servers[sock.serverid].socket.destroy();
                    
                    servers[sock.serverid] = { socket: sock, users: {} };
                    

                    var count = 0;
                    for (client in clients) count++;
                    sock.SendTable([ 'players', count ]);
                    
                    for (client in clients)
                        sock.SendTable([ 'join', clients[client].userid, clients[client].steamid, clients[client].name, 1 ]);
                        
                    sock.SendTable([ 'endburst' ]);
                    
                    console.log('[GAME] ' + (sock.remoteAddress || sock._remoteAddress) + ' identified as server ' + sock.serverid);
                    break;
                
                case 'players':
                    break;
                
                case 'endburst':
                    sock.endburst = true;
                    break;
                    
                case 'say':
                    var UserID = data[1];
                    var txt = data[2];
                    var usr = servers[sock.serverid].users[UserID];
                    var Name = usr.Name || "PLAYER MISSING??";
                    
                    console.log('[GAME] ' + Name + ': ' + txt);
                    io.sockets.in(sock.serverid).emit('chat', { server: parseInt(sock.serverid), name: Name, steamid: usr.SteamID, message: txt });
                    break;
                    
                case 'join':
                    var UserID = data[1];
                    var SteamID = data[2];
                    var Name = data[3];
                    
                    servers[sock.serverid].users[UserID] = { SteamID: SteamID, Name: Name };
                    console.log('[GAME] Player ' + Name + ' joined with steamid ' + SteamID);
                    io.sockets.in(sock.serverid).emit('join', { server: parseInt(sock.serverid), name: Name, steamid: SteamID });
                    break;
                    
                case 'leave':
                    var UserID = data[1];
                    var SteamID = data[2];
                    var usr = servers[sock.serverid].users[UserID];
                    var Name = usr.Name || "PLAYER MISSING??";
                    
                    console.log('[GAME] Player ' + Name + ' left with steamid ' + SteamID);
                    io.sockets.in(sock.serverid).emit('leave', { server: parseInt(sock.serverid), name: Name, steamid: SteamID });
                    delete servers[sock.serverid].users[UserID];
                    break;
                
                default:
                    console.log('[GAME] Unhandled sendtype: ' + sendtype);
                    break;
            }
        }
    });
    
    sock.on('disconnect', function() {
        if (servers[sock.serverid])
            delete servers[sock.serverid];
        console.log('[GAME] ' + (sock.remoteAddress || sock._remoteAddress) + ' disconnected');
    });
    sock.on('connect', function() {
        console.log('[GAME] Sending hello to ' + ((sock.remoteAddress || sock._remoteAddress) || sock._remoteAddress));
		sock.SendTable([ 'hello', 0, 'banni' ]);
    });
	
}
net.createServer(serverfunc).listen(GAMEPORT, "0.0.0.0");

var servers = [
	["88.191.102.162", 	27015, 37477, 1],
	["88.191.109.120", 	27015, 37477, 2]
	//["144.76.38.98", 	27015, 37477, 3]
];

for (var i=0; i<servers.length; i++) {
	var host = servers[i] [0];
	var port = servers[i] [2];
	if (host == undefined) continue;
	console.log('[GAME] Connecting to '+ host + ':'+port);
    var client = net.createConnection(port,host);
	client._remoteAddress = host;
	client._remotePort = port;
	serverfunc(client);
}



