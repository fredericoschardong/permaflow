//Set what is enabled
var video_drawing = true;
var high_res_drawing = true;
var high_res = true;
var show_bitrate = false;
var show_time_size = false;
var show_flip_video = false;
var allow_desync_high_res = true;
var fix_orientation = true;

//if true will refresh page in order to use the camera for high res., seems to not be needed in chrome mobile 29
var use_workaround_high_res = false;

var canvas_me;
var canvas_them;

var me;
var them;

var draw_at;

var particle = {
	size: 10,
	speed: 0.3
};

var mouseX;
var mouseY;

var mouseIsDown = false;

var trailTime = -1;
var counter = 0;

var mainInterval;
var sendImageIntervalId;
var timeout_id;

var socket;

var name;

var rtc;
var stream;
var user;

var stopDrawing = false;

var timestampPrev = 0;
var gesturableImg;

var sync = true;

function send_image(){
	if(sync){
		socket.emit("sync_photo_position", {
			position_x: gesturableImg.position.x,
			position_y: gesturableImg.position.y,
			scale_x: gesturableImg.scale.x,
			scale_y: gesturableImg.scale.y
		});
	}
}

function back_video(){
	location.reload();
}

function hexToRgb(hex) {
	// Expand shorthand form (e.g. "03F") to full form (e.g. "0033FF")
	var shorthandRegex = /^#?([a-f\d])([a-f\d])([a-f\d])$/i;

	hex = hex.replace(shorthandRegex, function(m, r, g, b) {
		return r + r + g + g + b + b;
	});

	var result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
	return result ? {
		r: parseInt(result[1], 16),
		g: parseInt(result[2], 16),
		b: parseInt(result[3], 16)
	} : null;
}

function main_interval(){
	mainInterval = setInterval(function(){
		counter++;

		if(counter >= trailTime){
			me.fillStyle = 'rgba(0,0,0,0.11)';
			me.fillRect(0, 0, me.canvas.width, me.canvas.height);

			if(them){
				them.fillStyle = 'rgba(0,0,0,0.11)';
				them.fillRect(0, 0, them.canvas.width, them.canvas.height);
			}
		}

		if(mouseIsDown && draw) {
			var lp = { x: particle.position.x, y: particle.position.y };

			particle.shift.x += (mouseX - particle.shift.x) * (particle.speed);
			particle.shift.y += (mouseY - particle.shift.y) * (particle.speed);

			particle.position.x = particle.shift.x + Math.cos(particle.offset.x);
			particle.position.y = particle.shift.y + Math.sin(particle.offset.y);

			draw(draw_at, lp.x, lp.y, particle.position.x, particle.position.y, particle.size, particle.fillColor);

			trailTime = counter + Math.pow(10, $("#time").val());

			socket.emit('draw', {
				'x1': lp.x / $("#canvas_" + draw_at).width(),
				'y1': lp.y / $("#canvas_" + draw_at).height(),
				'x2': particle.position.x / $("#canvas_" + draw_at).width(),
				'y2': particle.position.y / $("#canvas_" + draw_at).height(),
				'size': particle.size,
				'color': particle.fillColor,
				'trailTime': Math.pow(10, $("#time").val()),
				'draw_at': $("#flip_video").is(':checked') ? (draw_at == "me" ? "them" : "me") : draw_at
			});
		}
	}, 1000 / 60);
}

function prepare_photo(){
	socket.on("sync_photo_position", function(data){
		gesturableImg.position.x = data.position_x;
		gesturableImg.position.y = data.position_y;
		gesturableImg.scale.x = data.scale_x;
		gesturableImg.scale.y = data.scale_y;

		requestAnimationFrame(gesturableImg.animate.bind(gesturableImg));
	});
	
	clearInterval(mainInterval);

	if(high_res_drawing){
		init_drawing();
	}

	$(".them").css("margin-left", "0px").css("height", "70%").css("width", "100%");

	$("#them").hide();
	$(".me").hide();

	canvas_them.width = $("#img_canvas").width();
	canvas_them.height = $("#img_canvas").height();

	$("#img_canvas").hide();
	$("#flip_video").hide();
	$("#flip_video_label").hide();
	$("#photo").hide();

	$("#back_video").show();

	if(allow_desync_high_res){
		$("#sync_video").show();
	}
}

// Dumping a stats variable as a string.
function dumpStats(obj) {
	var statsString = 'Timestamp:';

	statsString += obj.timestamp;

	if (obj.id) {
		statsString += "<br>id " + obj.id;
	}

	if (obj.type) {
		statsString += " type " + obj.type;
	}

	if (obj.names) {
		names = obj.names();

		for (var i = 0; i < names.length; ++i) {
			statsString += '<br>' + names[i] + ':' + obj.stat(names[i]);
		}
	} else {
		if (obj.stat('audioOutputLevel')) {
			statsString += "audioOutputLevel: " + obj.stat('audioOutputLevel') + "<br>";
		}
	}

	return statsString;
}

function getURLParameter(name) {
    return decodeURI(
        (RegExp(name + '=' + '(.+?)(&|$)').exec(location.search)||[,null])[1]
    );
}

function createFullStream(){
	holla.createFullStream(function(err, stream) {
		window.stream = stream;

		console.log("createFullStream");

		if (err) {
			throw err;
		}

		if(video_drawing){
			init_drawing();
		}

		stream.pipe($("#me"));

		if(!$("#picture").val()){
			$(".me").show();
		}

		rtc.on("call", function(call) {
			window.call = call;

			console.log("Inbound call from ", call);

			call.on('error', function(err) {
				throw err;
			});

			call.setLocalStream(stream);
			call.answer();

			$("#fields").hide();
			$("#controls").show();
			$(".them").show();
			$("#alert").html("").hide();

			for (var key in call.users()) {
				call.users()[key].ready(function(stream) {
					$(".them").show();
					return stream.pipe($("#them"));
				});
			}
		});

		socket.emit("ready");
	});
}

$(document).ready(function() {
	$("#img_canvas").hide();
	$("#drawing").hide();	
	$("#button").hide();
	$("#bitrate").hide();

	if(!show_time_size){
		$("#time_div").hide();
		$("#size_div").hide();
	}

	if(!high_res){
		$("#photo").hide();
	}

	if(!show_flip_video){
		$("#flip_video_div").hide();
	}

	$("#canvas_them").hammer().on("doubletap", function(){
		if($("#img_canvas").is(":visible")){
			$("#remove").click();
			stopDrawing = true;
			$("#canvas_them").css("z-index", "0");
		}
	});

	$("#img_canvas").hammer().on("doubletap", function(){
		stopDrawing = false;
		$("#canvas_them").css("z-index", "1");
	});

	//window.location.hostname does not work with "localhost"
	socket = io.connect("http://" + window.location.hostname + ":8081");
	rtc = holla.createClient();

	$("#sync_video").click(function(){
		if($(this).html() == "D"){
			sync = true;
			$(this).html("S");

			socket.emit("desync");

			send_image();
		}
		else{
			sync = false;

			$(this).html("D");
			socket.emit("sync");
		}
	});

	socket.on("desync", function(){
		sync = true;
		$("#sync_video").html("S");
	});

	socket.on("sync", function(){
		sync = false;
		$("#sync_video").html("D");
	});

	socket.on("inform_name", function(data){
		name = data.name;

		if(getURLParameter("highres") == "true"){
			console.log("high_res");
			use_workaround_high_res = false;

			//$("#photo").click();						

			//socket.emit("prepare_photo");

			//$("#canvas_them").show();
	
			$("#picture").click();	

			//return;
		}

		rtc.register(name, function(err) {
			console.log("register " + name);

			if(err){
				console.log("errrrrr" + err);
				throw err;
			}

			console.log("go for createFullStream");

			createFullStream();
		});

		$("#alert").html("waiting for a partner...");
	});

	socket.on("call", function(data){
		//console.log("socket call");
		$("#whoCall").val(data.name);

		//$("#alert").html("waiting for partner's camera...");
	});

	socket.on("prepare_photo", function(){
		prepare_photo();

		$("#canvas_them").css("opacity", "0.3");
		$(".them").hide();
		$("#alert").html("Waiting for partner's picture").show();

		var image = new Image();
		image.id = document.getElementById("them");

		document.getElementById('image_stream').insertBefore(image, document.getElementById('image_stream').firstChild);

		socket.on("sync_photo", function(data){
			$("#alert").hide();
			$("#canvas_them").show();
			$("#back_video").show();
			$("#img_canvas").show();

			gesturableImg = new ImgTouchCanvas({
		        canvas: document.getElementById('img_canvas'),
		        path: data.photo
		    });

			$("#them").width($("#img_canvas").attr("width"));
			$("#them").height($("#img_canvas").attr("height"));

			$("#canvas_them").width($("#img_canvas").attr("width"));
			$("#canvas_them").height($("#img_canvas").attr("height"));

			socket.emit("sync_photo_complete");
		});
	});

	socket.on("ready", function(){
		console.log("socket ready");

		var id = setInterval(function(){
			if (typeof window.stream != 'undefined'){
				clearInterval(id);

				rtc.createCall(function(err, call) {
					window.call = call;

					if (err) {
						throw err;
					}

					console.log("Created call", call);

					call.on('error', function(err) {
						throw err;
					});

					call.setLocalStream(stream);
					call.add($("#whoCall").val());

					for (var key in call.users()) {
						call.users()[key].ready(function(stream) {
							$(".them").show();
							$("#alert").html("").hide();

							return stream.pipe($("#them"));
						});
					}
				});
			}
		}, 100);
	});

	socket.on("back_video", function(){
		back_video();
	});

	$(window).bind('orientationchange', function(e){
		if($("#picture").val() || fix_orientation){
			if(window.orientation != 0){
				$("#alert").html("rotation is not supported, please return to portrait orientation").show();
				$(".video-container, #controls").hide();
			}
			else{
				$("#alert").html("").hide();
				$(".video-container, #controls").show();
			}
		}
		else{
			if(window.orientation == 0) {
				$(".them").css("margin-left", "-165px");
			} 
			else {
				$(".them").css("margin-left", "0");
			}
		}
	});

	$("#back_video").click(function(){
		socket.emit("back_video");

		back_video();		
	});

	$("#size").change(function(){
		particle.size = Math.pow(5, $(this).val());
	});

	$("#time").change(function(){
		trailTime = counter + Math.pow(10, $("#time").val());
	});

	$("#colour").click(function(){
		particle.fillColor = '#' + (Math.random() * 0x404040 + 0xaaaaaa | 0).toString(16);
		$(this).css('background-color', particle.fillColor);	
	}).css('background-color', "rgb(200, 22, 161)");	

	$("#remove").click(function(){
		trailTime = 0;
		mouseIsDown = false;
		clearTimeout(timeout_id);

		socket.emit('clear');
	});

	$("#flip_video").click(function(){
		var temp = $("#me").attr("src");

		$("#me").attr("src", $("#them").attr("src"));
		$("#them").attr("src", temp);
	});

	$("#photo").click(function(){
		if(use_workaround_high_res){
		   window.location.href = window.location.href + "?highres=true";
		}
		else{
			console.log("photo click");

			if (typeof call != 'undefined'){
				//call.end();
				call.releaseLocalStream();
				//stream.getVideoTracks()[0].enabled = false;
			}

			socket.emit("prepare_photo");

			$("#canvas_them").show();
	
			$("#picture").click();

			console.log("calling connect");

			//rtc.unregister(function(data){console.log(data)});
			//socket.socket.disconnect();
		}
	});

	$("#picture").change(function(event){
		console.log("on take picture");
		prepare_photo();
	
		$("#canvas_them").hide();

		$("#alert").html("Sending picture").show();

		socket.on("sync_photo_complete", function(){
			$("#alert").html("").hide();
			$("#canvas_them").show();
		});

		$("#img_canvas").show();	

		var files = event.originalEvent.target.files;

		if (files && files.length > 0) {
			var URL = window.URL || window.webkitURL;
			var imgURL = URL.createObjectURL(files[0]);

			var reader = new FileReader();

            reader.onload = function(event){
				//socket.socket.connect();
				createFullStream();

				socket.emit("sync_photo", {
					photo: event.target.result,
					canvas_width: $("#img_canvas").width(),
					canvas_height: $("#img_canvas").height()
				});
            };

			gesturableImg = new ImgTouchCanvas({
		        canvas: document.getElementById('img_canvas'),
		        path: imgURL
		    });

			reader.readAsDataURL(files[0]);

			$("#me").width($("#img_canvas").attr("width"));
			$("#me").height($("#img_canvas").attr("height"));

			//$("#canvas_me").attr("width", $("#img_canvas").attr("width"));
			//$("#canvas_me").attr("height", $("#img_canvas").attr("height"));

			URL.revokeObjectURL(imgURL);

			mouseX = $("#drawing").width() * 0.5;
			mouseY = $("#drawing").height() * 0.5;

			particle = {
				size: Math.pow(5, $("#size").val()),
				position: { x: mouseX, y: mouseY },
				offset: { x: 0, y: 0 },
				shift: { x: mouseX, y: mouseY },
				speed: 0.3,
				fillColor: "#C816A1"
			};

			canvas_me = document.getElementById('drawing');

			if (canvas_me && canvas_me.getContext) {
				me = canvas_me.getContext('2d');
			}

			//socket.emit("sync_photo", {
			//	photo: document.getElementById("img_canvas").toDataURL('image/jpeg', 0.3)
			//});
		}
	});

	$(window).resize(function() {
		setSize = true;
	});

	$("video").resize(function(){
		if($(this).attr("id") == "me"){
			if(canvas_me){
				canvas_me.width = $("#me").width();
				canvas_me.height = $("#me").height();
			}
		}
		else{
			if(canvas_them){
				canvas_them.width = $("#them").width();
				canvas_them.height = $("#them").height();
			}

			//$(".them").show();
		}
	});

	$("#canvas_me, #canvas_them").bind("touchmove mousemove", function(e){
		if(!stopDrawing){
			if(e.originalEvent.touches){
				mouseX = e.originalEvent.touches[0].pageX - $(this).offset().left;
				mouseY = e.originalEvent.touches[0].pageY - $(this).offset().top;

				e.stopPropagation(); 
				e.preventDefault();
			}
			else{
				mouseX = e.clientX - $(this).offset().left;
				mouseY = e.clientY - $(this).offset().top;
			}

			draw_at = $(this).attr("class");

			if(draw_at == "high_res"){
				draw_at = "them";
			}
		}
	});

	$("#canvas_me, #canvas_them").bind("touchstart mousedown", function(e){
		if(!stopDrawing){
			if(e.originalEvent.touches){
				mouseX = e.originalEvent.touches[0].pageX - $(this).offset().left;
				mouseY = e.originalEvent.touches[0].pageY - $(this).offset().top;
		
				e.stopPropagation(); 
				e.preventDefault();
			}
			else{
				mouseX = e.pageX - $(this).offset().left;
				mouseY = e.pageY - $(this).offset().top;
			}

			draw_at = $(this).attr("class");

			if(draw_at == "high_res"){
				draw_at = "them";
			}		

			particle.shift.x += (mouseX - particle.shift.x);
			particle.shift.y += (mouseY - particle.shift.y);

			particle.position.x = particle.shift.x + Math.cos(particle.offset.x);
			particle.position.y = particle.shift.y + Math.sin(particle.offset.y);

			mouseIsDown = true;
		
			socket.emit('mousedown', {
				'x': particle.position.x,
				'y': particle.position.y,
				'mouseIsDown': mouseIsDown,
				'draw_at': draw_at
			});
		}
	});
	
	$("#canvas_me, #canvas_them").bind("touchend mouseup", function(){
		mouseIsDown = false;
	});

	$("#img_canvas").bind("touchend mouseup", function(){
		send_image();
	});

	socket.on('draw', function(data) {
		var flip;

		if($("#photo").is(":visible")){
			flip = data.draw_at == "me" ? "them" : "me";
		}
		else{
			flip = "them";// + data.draw_at;

			if(sync == true){
				stopDrawing = false;
				$("#canvas_them").css("z-index", "1");				
			}
		}

		draw(flip, 
			$("#canvas_" + flip).width() * data.x1, 
			$("#canvas_" + flip).height() * data.y1, 
			$("#canvas_" + flip).width() * data.x2, 
			$("#canvas_" + flip).height() * data.y2, 
			data.size, 
			data.color);
			
		trailTime = counter + data.trailTime;
	});

	socket.on("clear", function(){
		trailTime = 0;
		mouseIsDown = false;

		clearTimeout(timeout_id);
	});

	document.onselectstart = function() { return false; }

	// Display statistics
	if(show_bitrate){
		$("#bitrate").show();

		setInterval(function() {
			function display(str) {
				$('#bitrate').html("Bitrate: " + str);
			}

			if (typeof window.call != 'undefined'){
				for (var key in call.users()) {
					call.user(key).connection.getStats(function(stats) {
						var statsString = '';
						var results = stats.result();
						var bitrateText;// = 'No bitrate stats';

						for (var i = 0; i < results.length; ++i) {
							var res = results[i];
							statsString += '<h3>Report ' + i + '</h3>';

							if (!res.local || res.local === res) {
								statsString += dumpStats(res);

								if (res.type == 'ssrc' && res.stat('googFrameHeightReceived')) {
									var bytesNow = res.stat('bytesReceived');

									if (timestampPrev > 0) {
										var bitRate = Math.round((bytesNow - bytesPrev) * 8 / (res.timestamp - timestampPrev));
										bitrateText = bitRate + ' kbits/sec';
									}

									timestampPrev = res.timestamp;
									bytesPrev = bytesNow;
								}
							} else {
								// Pre-227.0.1445 (188719) browser
								if (res.local) {
									statsString += "<p>Local " + dumpStats(res.local);
								}

								if (res.remote) {
									statsString += "<p>Remote " + dumpStats(res.remote);
								}
							}
						}

						$('receiverstats').innerHTML = statsString;

						display(bitrateText);
					});
				}
			}
			else{
				display("No stream");
			}
		}, 1000);
	}
});

function init_drawing() {
	mouseX = $("#me").width() * 0.5;
	mouseY = $("#me").height() * 0.5;

	canvas_me = document.getElementById('canvas_me');
	canvas_them = document.getElementById('canvas_them');

	if (canvas_me && canvas_me.getContext) {
		me = canvas_me.getContext('2d');
		them = canvas_them.getContext('2d');

		particle = {
			size: Math.pow(5, $("#size").val()),
			position: { x: mouseX, y: mouseY },
			offset: { x: 0, y: 0 },
			shift: { x: mouseX, y: mouseY },
			speed: 0.3,
			fillColor: "rgb(200, 22, 161)"
		};

		main_interval();
	}
}

function draw(at, x1, y1, x2, y2, size, color){
	if(!stopDrawing){
		if(window[at]){
			window[at].beginPath();
			window[at].fillStyle = color;
			window[at].strokeStyle = color;
			window[at].lineWidth = size;
			window[at].moveTo(x1, y1);
			window[at].lineTo(x2, y2);
			window[at].stroke();
			window[at].arc(x2, y2, size / 2, 0, Math.PI * 2, true);
			window[at].fill();
		}
	}
}
