var express = require('express');
var fs = require('fs');
var bodyParser  = require("body-parser");
var http = require('http');
var https = require('https');
var app = express();
var mongo = require('mongodb');

require('dotenv').config();

var MongoClient = mongo.MongoClient;

var mongodb;
//Connection URL
const url = process.env.list_db_url;

//Database Name
const dbName = process.env.list_db_name;

//Collection Name
const dbCollectionName = process.env.list_db_collection;

var port = process.env.PORT || 3000;
process.env['PORT'] = process.env.PORT || 4000; // Used by https on localhost

var FB_APP_ID = process.env.list_fb_app_id;

var server = http.createServer(app);

//Create connection pool to mongodb
MongoClient.connect(url, function(err, db) {  
	mongodb = db.db(dbName);
	server.listen(port, function () {
	    console.log("Express server listening on port %d in %s mode", this.address().port, app.settings.env);
	});
	
	// use SSL locally.
	if (process.env.NODE_ENV != 'production') {
		//Run separate https server if on localhost
		var privateKey = fs.readFileSync('localhost/localhost.key').toString();
		var certificate = fs.readFileSync('localhost/localhost.crt').toString();

		var options = {
		  key : privateKey
		, cert : certificate
		}
		
	    https.createServer(options, app).listen(process.env.PORT, function () {
	        console.log("Express server listening with https on port %d in %s mode", this.address().port, app.settings.env);
	    });
	};
});


if (process.env.NODE_ENV === 'production') {
	// Force redirect of HTTP to HTTPS
	var forceSsl = function (req, res, next) {
		if (req.headers['x-forwarded-proto'] !== 'https') {
			return res.redirect(['https://', req.get('Host'), req.url].join(''));
		}
		return next();
	};
	app.use(forceSsl);
}
 
 
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

app.use('/static', express.static('static'));
app.use('/files', express.static('files'));
app.use('/scripts', express.static('scripts'));


app.get('/', function(req, res){
	fs.readFile('list.html', function(err, file) {
		res.setHeader('Content-Type', 'text/html');
		res.setHeader('Content-Length', file.length);
		res.end(file);
	});
});


//privary
app.get('/privacy', function(req, res){
	fs.readFile('privacy-policy.html', function(err, file) {
		res.setHeader('Content-Type', 'text/html');
		res.setHeader('Content-Length', file.length);
		res.end(file);
	});
});

//privary
app.get('/tos', function(req, res){
	fs.readFile('terms-of-service.html', function(err, file) {
		res.setHeader('Content-Type', 'text/html');
		res.setHeader('Content-Length', file.length);
		res.end(file);
	});
});


app.get('/api/facebook-app-id', function (req, res) {
	res.send(FB_APP_ID);
})

/*
 * JSON template
 * 
Date,		Open,	High,	Low,	Close,Volume
9-Jun-14,	62.40,	63.34,	61.79,	62.88,37617413
 
[{"Date":"9-Jun-14","Open":62.40,"High":63.34,"Low":61.79,"close":"62.88","Volume":37617413},
{"Date":"9-Jun-14","Open":62.40,"High":63.34,"Low":61.79,"close":"62.88","Volume":37617413},
{"Date":"9-Jun-14","Open":62.40,"High":63.34,"Low":61.79,"close":"62.88","Volume":37617413},
{"Date":"9-Jun-14","Open":62.40,"High":63.34,"Low":61.79,"close":"62.88","Volume":37617413},
{"Date":"9-Jun-14","Open":62.40,"High":63.34,"Low":61.79,"close":"62.88","Volume":37617413}
]

 */

app.get('/offline', function(request, response){
	var obj = JSON.parse(fs.readFileSync('scripts/css/offline.json', 'utf8'));
	response.send(obj);
    response.end();
});



/*
{
	user:UserId, 
	name:dataToSave,
	done:false}
}
 */ 
app.post('/saveItem', function (req, res) {
	console.log("===> saveItem called");
    // retrieve user posted data from the body
    var json = req.body;
    
    // format json
    console.log(json);
    
//    InsertDocument(json);
    UpdateDocument(json);	
    
    	res.send('successfully inserted');
});

app.post('/updateStatus', function (req, res) {
	console.log("===> updateStatus called");
    // retrieve user posted data from the body
    var json = req.body;
    
    // format json
    console.log(json);
    
//    InsertDocument(json);
    UpdateStatus(json);	
    
    	res.send('successfully inserted');
});

//getByUserId
app.post('/getByUserId', function (req, res) {
	var json = req.body;
	var userId = json.userId;
	var token = json.token;
	
	authenticateUser (userId, token, function(docs){
//		console.log("===== USER AUTHENTICATED. Callback executing...");
//		GetByUserId(userId, function (docs) {
			res.json(docs);
//		});
	});
});


app.post('/deleteItem', function (req, res) {
	console.log("===> deleteItem called");
    // retrieve user posted data from the body
    var json = req.body;
    
//    InsertDocument(json);
    DeleteItem(json, function(){
    		res.send('successfully deleted!');
    });	
});


/*
 * input: 
 * - token: frontend pass in token from FB login event
 * - userId: the user ID passed by requester. if null, meaning the user has not logged into our application. 
 * - callback: what to do after login successfully. 
 * 
 * To authenticate a user
 * - validate token is from this app /app?access_token= => 
 * - validate facebook.id = user.facebookId /me => json.id
 */

function authenticateUser (userId, token, callback) {
	validateFbToken(token, function () {
		console.log("===== TOKEN HAS BEEN AUTHENTICATED =====");
		validateUserId(userId, token, callback);
	});
}

function validateFbToken (token, callback) {
	console.log("===> validateFbToken called " + token);
	// retrieve user posted data from the body
	var options = {
			hostname: "graph.facebook.com",
			method: 'GET',
			path: '/app?access_token='+token
	};

	var body = "";
	var req = https.request(options, function(res) { // res is IncomingMessage help: http://nodejs.org/api/http.html#http_http_incomingmessage
		// res.statusCode
		res.setEncoding("utf8");
		res.on('data', function (chunk) {// this happens multiple times! So need to use 'body' to collect all data
			body += chunk;
		});

		var data="";
		res.on('end', function () { // when we have full 'body', convert to JSON and send back to client.
			try {
				data = JSON.parse(body);
				console.log(data);
				
				if (data.id === FB_APP_ID) {
					console.log("correct access token. go next request");
					callback();
				} else {
					Fb_Validate_Fail ("incorrect FB_APP_ID received from FB response.");
				}
			} catch (er) {
				Fb_Validate_Fail(er);
			}
		});
	});

	req.on('error', (e) => {
		Fb_Validate_Fail(e);
	});
	req.end();
}

function Fb_Validate_Fail (err) {
	console.log("wrong access token.");
}

function validateUserId (userId, token, callback) {
	// Get FacebookId based on token
	console.log("===> Get FacebookId based on token " + token);
	// retrieve user posted data from the body
	var options = {
			hostname: "graph.facebook.com",
			method: 'GET',
			path: '/me?access_token='+token
	};

	var body = "";
	var req = https.request(options, function(res) { // res is IncomingMessage help: http://nodejs.org/api/http.html#http_http_incomingmessage
		// res.statusCode
		res.setEncoding("utf8");
		res.on('data', function (chunk) {// this happens multiple times! So need to use 'body' to collect all data
			body += chunk;
		});

		var data="";
		res.on('end', function () { // when we have full 'body', convert to JSON and send back to client.
			try {
				data = JSON.parse(body);
				console.log(data);
				
				var facebookId = parseInt(data.id);
				
				// Get the documents collection
				const collection = mongodb.collection(dbCollectionName);
				collection.findAndModify(
					{"user.facebookId":facebookId},
					null,
					{$setOnInsert: {"user":{"facebookId":facebookId}, "todo":[], "shopping":[]}},
					{
						upsert: true,
						new: true
					},
					function(err, result) {
						console.log(result);
						if (callback) {
							callback(result.value);
						}
					}
				);
				
//				collection.find({"_id":id}).toArray(function(err, docs) {
//					callback(docs);
//				});
				
				
			} catch (er) {
				Fb_Validate_Fail(er);
			}
		});
	});

	req.on('error', (e) => {
		Fb_Validate_Fail(e);
	});
	req.end();
}

//database connection
function InsertDocument (json, callback) {
	// Get the documents collection
	const collection = mongodb.collection(dbCollectionName);
	// Insert some documents
	collection.insertOne(
		json, 
		function(err, result) {
			console.log("Inserted 3 documents into the collection");
			console.log(result);
			console.log(err); // err is null
			if (callback) {
				console.log("has callback");
				callback();
			}
		}
	);
}


/*
 * db.collection.update({"_id":1},{"$push":{"todo":{"name":"apple","done":false}}})
{
	user:UserId,
	name:dataToSave,
	done:false}
}
 */
function UpdateDocument (json, callback) {
	// Get the documents collection
	const collection = mongodb.collection(dbCollectionName);
	// Insert some documents
	var statusBool = json.done === 'true';
	collection.updateOne(
		{"_id": helperBuildObjectId(json.user)},
		{$push: {"todo":{"name":json.name,"done":statusBool}}}, 
		{
			upsert:true
		},
		function(err, result) {
			if (callback) {
				console.log("has callback");
				callback();
			}
		}
	);
}

/*
 * db.collection.update({"_id":1,"todo.name":"apple"}, {$set: {"todo.$.done":true}})
{
	user:UserId, 
	name:item,
	done:status
}
 */
function UpdateStatus (json, callback) {
	// Get the documents collection
	const collection = mongodb.collection(dbCollectionName);
	// Insert some documents
	var statusBool = (json.done === 'true');
	collection.updateOne(
		{"_id":helperBuildObjectId(json.user), "todo.name":json.name},
		{$set: {"todo.$.done":statusBool}}, 
		{
			upsert:true
		},
		function(err, result) {
			if (callback) {
				console.log("has callback");
				callback();
			}
		}
	);
}


// search collection by {"_id":1}
function GetByUserId (idint, callback) {
	// Get the documents collection
	const collection = mongodb.collection(dbCollectionName);
	// Find some documents
	collection.find({"_id":helperBuildObjectId(idint)}).toArray(function(err, docs) {
		callback(docs);
	});
}



/*
 * db.collection.update({"_id":1},{$pull:{"todo":{"name":"zzzzzzz"}}})
{
	user:'UserId',
	name:'dataToDelete'
}
 */
function DeleteItem (json, callback) {
	// Get the documents collection
	const collection = mongodb.collection(dbCollectionName);
	
	collection.updateOne(
		{"_id":helperBuildObjectId(json.user)},
		{$pull: {"todo":{"name":json.name}}}, 
		function(err, result) {
			console.log("Delete document from the collection");
			if (callback) {
				console.log("has callback");
				callback();
			}
		}
	);
}




function helperBuildObjectId (inputId) {
	var objectId = new mongo.ObjectID(inputId);
	console.log(objectId);
	return objectId;
}
