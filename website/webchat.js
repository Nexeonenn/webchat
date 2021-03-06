var chaturl = "./";
var chatserv = 'wss://sso.metastruct.uk.to:8443';

(function(namespace) { // Closure to protect local variable "var hash"
    if ('replaceState' in history) { // Yay, supported!
        namespace.replaceHash = function(newhash) {
            if ((''+newhash).charAt(0) !== '#') newhash = '#' + newhash;
            history.replaceState('', '', newhash);
        }
    } else {
        var hash = location.hash;
        namespace.replaceHash = function(newhash) {
            if (location.hash !== hash) history.back();
            location.hash = newhash;
        };
    }
})(window);


function textToLink(text) {
    var exp = /(\b(https?|ftp|file):\/\/[-A-Z0-9+&@#\/%?=~_|!:,.;]*[-A-Z0-9+&@#\/%=~_|])/ig;
    return text.replace(exp, '<a href="$1" target="_blank">$1</a>'); 
}

function escapeEntities(text) {
    return text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function NewMessage() {
    var container = $('<tr />');
    var ServerBox = $('<td />');
    var NickBox = $('<td />');
    var MessageBox = $('<td />');
    var TimeBox = $('<td />');
    TimeBox.text(  (new Date()).toLocaleTimeString() );
    container.append(ServerBox);
    container.append(NickBox);
    container.append(MessageBox);
    container.append(TimeBox);
    $(".chat").prepend(container.fadeIn(200));
    $('.chat tr:nth-child(1000)').remove();
    return {srv:ServerBox,nick:NickBox,msg:MessageBox,time:TimeBox};
}

function PrintInfo(message) {
    var c = NewMessage();
    c.time.text(  (new Date()).toLocaleTimeString() );
    c.msg.text(message);
    c.nick.text("SYSTEM");
}

PrintInfo("Connecting to server...");

var token = window.location.hash.substring(1);
if ( typeof io == 'undefined' )
{
    PrintInfo("IO LIBRARY NOT LOADED. SERVER BROKEN!");
} 

if (token && token.length>1) 
{
    var socket = io.connect(chatserv,{
        reconnect: false
    });
}
else 
{
    PrintInfo("Forwarding to login...");
    window.location.href = chaturl+"?nocache="+Math.floor((Math.random()*10000000)+1);;
}
window.replaceHash(' ');


socket.on('connect', function() {
    socket.emit('token', token);
    
    socket.on('invalidtoken', function() {
        PrintInfo("Token is invalid, Forwarding to login.");
        setInterval(function(){
            window.location.href = chaturl+"?nocache="+Math.floor((Math.random()*10000000)+1);;
        },1500);
    });
    
    socket.on('ready', function() {
        PrintInfo("Connected!");
        
        socket.on('chat', function(data) {
            var c = NewMessage();
            
            c.msg.text(data.message);
            c.srv.text('#' + ((data.server) ? data.server : 'WEB'));
            
            if (data.steamid) {
                $('<a>',{   text: data.name,
                            target: "_blank",
                            href: 'http://steamcommunity.com/profiles/' + data.steamid,
                        }).appendTo(c.nick);
            } else {
                c.nick.text(data.name);
            }
            
            c.msg.html(textToLink(escapeEntities(data.message)));
            
        });
        
        socket.on('join', function(data) {
            var c = NewMessage();
            
            c.msg.text("joined the server!");
            c.msg.addClass('join');
            c.srv.text('#' + ((data.server) ? data.server : 'WEB'));
            
            if (data.steamid) {
                $('<a>',{   text: data.name,
                            target: "_blank",
                            href: 'http://steamcommunity.com/profiles/' + data.steamid,
                        }).appendTo(c.nick);
            } else {
                c.nick.text(data.name);
            }
            
        });
        
        socket.on('leave', function(data) {
            var c = NewMessage();
            
            c.msg.text("left the server!");
            c.msg.addClass('leave');
            c.srv.text('#' + ((data.server) ? data.server : 'WEB'));
            
            if (data.steamid) {
                $('<a>',{   text: data.name,
                            target: "_blank",
                            href: 'http://steamcommunity.com/profiles/' + data.steamid,
                        }).appendTo(c.nick);
            } else {
                c.nick.text(data.name);
            }
        });
		
        $('#sendbtn').click(function(e) {
            e.preventDefault();
            if ($('#chatinput').val().trim() == "") return;
            socket.emit('message', $('#chatinput').val());
            $('#chatinput').val('');
        });
		
        $('form').submit(function(e) {
            e.preventDefault();
            if ($('#chatinput').val().trim() == "") return;
            socket.emit('message', $('#chatinput').val());
            $('#chatinput').val('');
        });
        
    });
});




socket.on('disconnect', function() {
    PrintInfo('Server disconnected us.');
});

socket.on('error', function (e) {
    PrintInfo(e ? e : 'A unknown error occurred.');
    console.log('System', e ? e : 'A unknown error occurred');
});