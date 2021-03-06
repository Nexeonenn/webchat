import cgi
#import cgitb; cgitb.enable()  # for troubleshooting
import sys
import socket
import os

print "Content-type: text/html"
print "Transfer-Encoding: chunked"
print ""


form = cgi.FieldStorage()

validadders = {
	"1.2.3.4": True
}

where = ( "127.0.0.1", 18080 )
 
who = os.environ["REMOTE_ADDR"]

data = form.getvalue("data")

if not validadders.get(who):
	print "OK!"
	exit(1)


try:
	s = socket.socket(socket.AF_INET, socket.SOCK_STREAM) 
	s.connect(where)
except:
	print "service offline"
	exit(1)

s.send(data)

s.close()

sys.stdout.write( 'OK' )
#: ',data
sys.stdout.flush()
