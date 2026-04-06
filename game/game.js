class Game{
	constructor(){
		if ( ! Detector.webgl ) Detector.addGetWebGLMessage();

		this.modes = Object.freeze({
			NONE:   Symbol("none"),
			PRELOAD: Symbol("preload"),
			INITIALISING:  Symbol("initialising"),
			CREATING_LEVEL: Symbol("creating_level"),
			ACTIVE: Symbol("active"),
			GAMEOVER: Symbol("gameover")
		});
		this.mode = this.modes.NONE;
		
		this.interactive = false;
		this.levelIndex = 0;
		this._hints = 0;
		this.score = 0;
		this.debug = false;
		this.debugPhysics = false;
		this.fixedTimeStep = 1.0/60.0;
		this.js = [{forward:0, turn:0}, {forward:0, turn:0}];
        this.assetsPath = "assets/";
		
		this.messages = { 
			text:[ 
			"Welcome to Skyblade.",
			],
			index:0
		}
		
		this.container = document.createElement( 'div' );
		this.container.style.height = '100%';
		document.body.appendChild( this.container );
		
		const sfxExt = SFX.supportsAudioType('mp3') ? 'mp3' : 'ogg';
		const game = this;
		
		const options = {
			assets:[
                "assets/rc_time_trial.fbx",
				"assets/images/logo.png",
				"assets/images/nx.jpg",
				"assets/images/px.jpg",
				"assets/images/ny.jpg",
				"assets/images/py.jpg",
				"assets/images/nz.jpg",
				"assets/images/pz.jpg",
                `${this.assetsPath}sfx/bump.${sfxExt}`,
                `${this.assetsPath}sfx/click.${sfxExt}`,
                `${this.assetsPath}sfx/engine.${sfxExt}`,
                `${this.assetsPath}sfx/skid.${sfxExt}`,
			],
			oncomplete: function(){
				//game.init();
				//game.animate();
			}
		}
		
		for(let i=0; i<=16; i++){
			const path = `${this.assetsPath}images/carparts${String(i).padStart(4, '0')}.png`;
			options.assets.push(path);
		}
		
		this.mode = this.modes.PRELOAD;
		this.motion = { forward:0, turn:0 };
		this.clock = new THREE.Clock();

        this.initSfx();
        
        this.carGUI = [0]; // single value: which car is selected (0 = none, 1/2/3 = car index)

		if ('ontouchstart' in window){
			document.getElementById('reset-btn').addEventListener('touchstart', function(){ game.resetCar(0); });
		}else{
			document.getElementById('reset-btn').onclick = function(){ game.resetCar(0); };
		}

        let index = 0;
        document.getElementById('part-select').childNodes.forEach(function(node){
            if (node.nodeType==1){
                const i = index;
                node.onclick = function(){
                    game.carGUIHandler(i);
                };
                index++;
            }
        });
        
        document.getElementById('play-btn').onclick = function(){ game.startGame(); };
        
		const preloader = new Preloader(options);
		
		window.onerror = function(error){
			console.error(JSON.stringify(error));
		}

		this.initSocket();
	}
	
    carGUIHandler( carIndex ){
        this.sfx.click.play();
        this.carGUI[0] = carIndex + 1; // 1, 2, or 3

        // Highlight the selected button, dim the others
        let btnIndex = 0;
        document.getElementById('part-select').childNodes.forEach(function(node){
            if (node.nodeType === 1){
                node.style.borderColor = btnIndex === carIndex ? '#00c8ff' : '';
                node.style.color       = btnIndex === carIndex ? '#00c8ff' : '';
                node.style.boxShadow   = btnIndex === carIndex ? '0 0 12px rgba(0,200,255,0.35)' : '';
                btnIndex++;
            }
        });

        // Fade in the glow behind the car
        document.getElementById('car-glow').classList.add('visible');
    }
    
    startGame(){
        this.sfx.click.play();

        if (this.carGUI[0] === 0){
            this.sfx.skid.play();
            showMessage('Please choose a car first.');
            return;
        }
        
        //Hide the GUI
        const gui = ["part-select", 'car-parts', 'message', 'play-btn'];
        gui.forEach(function(id){
            document.getElementById(id).style.display = 'none';
        })
        
        document.getElementById('reset-btn').style.display = 'block';
        document.getElementById('hud').style.display = 'block';
        document.getElementById('split-divider').style.display = 'block';
        document.getElementById('label-p1').style.display = 'block';
        document.getElementById('label-p2').style.display = 'block';
        document.getElementById('hud-speed-p2').style.display = 'block';

        this.sfx.engine.play();
        this.init();
        this.animate();
        
        function showMessage(msg){
            const elm = document.getElementById("message");
            elm.innerHTML = msg;
        }
    }
    
	makeWireframe(mode=true, model=this.assets){
		const game = this;
		
		if (model.isMesh){
			if (Array.isArray(model.material)){
				model.material.forEach(function(material){ material.wireframe = mode; });
			}else{
				model.material.wireframe = mode;
			}
		}
		
		model.children.forEach(function(child){
			if (child.children.length>0){
				game.makeWireframe(mode, child);
			}else if (child.isMesh){
				if (Array.isArray(child.material)){
					child.material.forEach(function(material){ material.wireframe = mode; });
				}else{
					child.material.wireframe = mode;
				}
			}
		});
	}
	
	resetCar( playerID = 0 ){
        this.sfx.skid.play();
		if (!this.vehicles || !this.vehicles[playerID]) return;
		const vehicle = this.vehicles[playerID];
		let checkpoint;
		let distance = 10000000000;
		const carPos = vehicle.chassisBody.position;
		this.checkpoints.forEach(function(obj){
			const pos = obj.position.clone();
			pos.y = carPos.y;
			const dist = pos.distanceTo(carPos);
			if (dist<distance){
				checkpoint = obj;
				distance = dist;
			}
		});
		vehicle.chassisBody.position.copy(checkpoint.position);
		vehicle.chassisBody.quaternion.copy(checkpoint.quaternion);
		vehicle.chassisBody.velocity.set(0,0,0);
		vehicle.chassisBody.angularVelocity.set(0,0,0);
	}
	
	initSfx(){
		this.sfx = {};
		this.sfx.context = new (window.AudioContext || window.webkitAudioContext)();
		this.sfx.bump = new SFX({
			context: this.sfx.context,
			src:{mp3:`${this.assetsPath}sfx/bump.mp3`, ogg:`${this.assetsPath}sfx/bump.ogg`},
			loop: false,
			volume: 0.3
		});
        this.sfx.click = new SFX({
			context: this.sfx.context,
			src:{mp3:`${this.assetsPath}sfx/click.mp3`, ogg:`${this.assetsPath}sfx/click.ogg`},
			loop: false,
			volume: 0.3
		});
        this.sfx.engine = new SFX({
			context: this.sfx.context,
			src:{mp3:`${this.assetsPath}sfx/engine.mp3`, ogg:`${this.assetsPath}sfx/engine.ogg`},
			loop: true,
			volume: 0.1
		});
        this.sfx.skid = new SFX({
			context: this.sfx.context,
			src:{mp3:`${this.assetsPath}sfx/skid.mp3`, ogg:`${this.assetsPath}sfx/skid.ogg`},
			loop: false,
			volume: 0.3
		});
	}
	
	init() {
		this.mode = this.modes.INITIALISING;
		const game = this;

		const halfAspect = window.innerWidth / (window.innerHeight / 2);
		this.cameras = [
			new THREE.PerspectiveCamera(45, halfAspect, 1, 500),
			new THREE.PerspectiveCamera(45, halfAspect, 1, 500)
		];
		this.cameras[0].position.set( 0, 6, -15 );
		this.cameras[1].position.set( 0, 6, -15 );
		this.camera = this.cameras[0];

		this.scene = new THREE.Scene();
		this.scene.background = new THREE.Color( 0x000000 );
		//this.scene.fog = new THREE.Fog( 0xa0a0a0, 20, 100 );
		
        // LIGHTS
        const ambient = new THREE.AmbientLight( 0xaaaaaa );
        this.scene.add( ambient );

        const light = new THREE.DirectionalLight( 0xaaaaaa );
        light.position.set( 30, 100, 40 );
        light.target.position.set( 0, 0, 0 );

        light.castShadow = true;

		const lightSize = 30;
        light.shadow.camera.near = 1;
        light.shadow.camera.far = 500;
		light.shadow.camera.left = light.shadow.camera.bottom = -lightSize;
		light.shadow.camera.right = light.shadow.camera.top = lightSize;

        light.shadow.bias = 0.0039;
        light.shadow.mapSize.width = 1024;
        light.shadow.mapSize.height = 1024;
		
		this.sun = light;
		this.scene.add(light);
		
		this.renderer = new THREE.WebGLRenderer( { antialias: true } );
		this.renderer.setPixelRatio( window.devicePixelRatio );
		this.renderer.setSize( window.innerWidth, window.innerHeight );
		this.renderer.shadowMap.enabled = true;
		this.renderer.autoClear = false;
		this.container.appendChild( this.renderer.domElement );
		
		if ('ontouchstart' in window){
			//this.renderer.domElement.addEventListener('touchstart', function(evt){ game.tap(evt); });
		}else{
			//this.renderer.domElement.addEventListener('mousedown', function(evt){ game.tap(evt); });
		}
		
		this.loadAssets();
		
		window.addEventListener( 'resize', function(){ game.onWindowResize(); }, false );

		if (this.debug){
			this.stats = new Stats();
			this.container.appendChild( this.stats.dom );
		}

		this.initP2Keyboard();
	}
	
	loadAssets(){
		const game = this;
		const loader = new THREE.FBXLoader();
		
		loader.load( 'assets/rc_time_trial.fbx', 
		function ( object ){
			let material, map, index, maps;
			const euler = new THREE.Euler();
			game.proxies = {};
			game.checkpoints = [];
				
			object.traverse( function ( child ) {
				let receiveShadow = true;
				if ( child.isMesh ) {
					if (child.name.includes("SkyBox")){
						child.visible = false;
					}else if (child.name=="Chassis"){
						game.car = { chassis:child, bonnet:[], engine:[], wheel:[], seat:[], xtra:[], selected:{} };
						game.followCam = new THREE.Object3D();
						game.followCam.position.copy(game.camera.position);
						game.scene.add(game.followCam)
						game.followCam.parent = child;
						game.sun.target = child;
						child.castShadow = true;
						receiveShadow = false;
					}else if (child.name.includes("Bonnet")){
						game.car.bonnet.push(child); 
						child.visible = false;
						child.castShadow = true;
						receiveShadow = false;
					}else if (child.name.includes("Engine")){
						game.car.engine.push(child);
						child.visible = false;
						child.castShadow = true;
						receiveShadow = false;
					}else if (child.name.includes("Seat")){
						game.car.seat.push(child);
						child.visible = false;
						receiveShadow = false;
					}else if (child.name.includes("Wheel") && child.children.length>0){
						game.car.wheel.push(child);
						child.parent = game.scene;
						child.visible = false;
						child.castShadow = true;
						receiveShadow = false;
					}else if (child.name.includes("Xtra")){
						game.car.xtra.push(child);
						child.visible = false;
						child.castShadow = true;
						receiveShadow = false;
					}else if (child.name.includes("ProxyKitchen")){
						game.proxies.main = child;
						child.visible = false;
					}else if (child.name=="CarProxyB"){
						game.proxies.car = child;
						child.visible = false;
					}else if (child.name=="ConeProxy"){
						game.proxies.cone = child;
						child.visible = false;
					}else if (child.name=="ShadowBounds"){
						child.visible = false;
					}else if (child.name=="CarShadow"){
						child.visible = false;
					}
					
					//child.castShadow = true;
					child.receiveShadow = receiveShadow;
				}else{
					if (child.name.includes("Checkpoint")){
						game.checkpoints.push(child);
						child.position.y += 1;
					}
				}
			});

			game.checkpoints.sort((a, b) => a.name.localeCompare(b.name));
			game.customiseCar();

			// ── Player 2 car: deep-clone P1's chassis mesh ─────────────────────
			const chassis2 = game.car.chassis.clone();
			chassis2.traverse(function(child){
				if (child.isMesh){
					if (Array.isArray(child.material)){
						child.material = child.material.map(function(m){
							const m2 = m.clone();
							m2.color.r = Math.min(1, m2.color.r * 0.5 + 0.5);
							m2.color.g *= 0.3;
							m2.color.b *= 0.3;
							return m2;
						});
					} else if (child.material) {
						child.material = child.material.clone();
						child.material.color.r = Math.min(1, child.material.color.r * 0.5 + 0.5);
						child.material.color.g *= 0.3;
						child.material.color.b *= 0.3;
					}
				}
			});
			game.scene.add(chassis2);
			game.car2 = { chassis: chassis2 };

			game.assets = object;
			game.scene.add( object );
			
			const tloader = new THREE.CubeTextureLoader();
			tloader.setPath( 'assets/images/' );

			var textureCube = tloader.load( [
				'px.jpg', 'nx.jpg',
				'py.jpg', 'ny.jpg',
				'pz.jpg', 'nz.jpg'
			] );

			game.scene.background = textureCube;
			
			game.initPhysics();
		},
		null, 
		function(error){
			console.error(error);
		}			
	 );
	}
	
	customiseCar(){
        // Show the chosen car body
        const carIndex = this.carGUI[0] - 1;
        if (this.car.bonnet.length > 0){
            this.car.bonnet[carIndex].visible = true;
            this.car.selected.bonnet = this.car.bonnet[carIndex];
        }
        // Auto-show the first available of everything else
        if (this.car.engine.length > 0){ this.car.engine[0].visible = true; this.car.selected.engine = this.car.engine[0]; }
        if (this.car.seat.length   > 0){ this.car.seat[0].visible   = true; this.car.selected.seat   = this.car.seat[0];   }
        if (this.car.xtra.length   > 0){ this.car.xtra[0].visible   = true; this.car.selected.xtra   = this.car.xtra[0];   }
        // Wheels are required for physics — use the first set found
        if (this.car.wheel.length  > 0){ this.car.wheel[0].visible  = true; this.car.selected.wheel  = this.car.wheel[0];  }
	}
	
	updatePhysics(){
		if (this.physics.debugRenderer!==undefined) this.physics.debugRenderer.scene.visible = true;
	}
	
	initPhysics(){
		this.physics = {};

		const game = this;
		const mass = 150;
		const world = new CANNON.World();
		this.world = world;

		world.broadphase = new CANNON.SAPBroadphase(world);
		world.gravity.set(0, -20, 0);
		world.defaultContactMaterial.friction = 0;

		const groundMaterial = new CANNON.Material("groundMaterial");
		const wheelMaterial  = new CANNON.Material("wheelMaterial");
		const wheelGroundContactMaterial = new CANNON.ContactMaterial(wheelMaterial, groundMaterial, {
			friction: 0.6,
			restitution: 0,
			contactEquationStiffness: 1e7
		});
		world.addContactMaterial(wheelGroundContactMaterial);

		const chassisShape = new CANNON.Box(new CANNON.Vec3(1, 0.3, 2));
		const axlewidth = 0.8;

		const wheelOptions = {
			radius: 0.3,
			directionLocal: new CANNON.Vec3(0, -1, 0),
			suspensionStiffness: 55,
			suspensionRestLength: 0.4,
			frictionSlip: 2.0,
			dampingRelaxation: 3.0,
			dampingCompression: 6.0,
			maxSuspensionForce: 200000,
			rollInfluence: 0.005,
			axleLocal: new CANNON.Vec3(-1, 0, 0),
			chassisConnectionPointLocal: new CANNON.Vec3(1, 1, 0),
			maxSuspensionTravel: 0.35,
			customSlidingRotationalSpeed: -30,
			useCustomSlidingRotationalSpeed: true
		};

		function buildVehicle(chassisBody, wheelMeshes){
			const vehicle = new CANNON.RaycastVehicle({
				chassisBody,
				indexRightAxis: 0, indexUpAxis: 1, indexForwardAxis: 2
			});
			wheelOptions.chassisConnectionPointLocal.set( axlewidth, 0, -1); vehicle.addWheel(wheelOptions);
			wheelOptions.chassisConnectionPointLocal.set(-axlewidth, 0, -1); vehicle.addWheel(wheelOptions);
			wheelOptions.chassisConnectionPointLocal.set( axlewidth, 0,  1); vehicle.addWheel(wheelOptions);
			wheelOptions.chassisConnectionPointLocal.set(-axlewidth, 0,  1); vehicle.addWheel(wheelOptions);
			vehicle.addToWorld(world);
			const wheelBodies = [];
			let wi = 0;
			vehicle.wheelInfos.forEach(function(wheel){
				const cyl = new CANNON.Cylinder(wheel.radius, wheel.radius, wheel.radius/2, 20);
				const wb  = new CANNON.Body({ mass: 1 });
				const q   = new CANNON.Quaternion();
				q.setFromAxisAngle(new CANNON.Vec3(0, 1, 0), Math.PI/2);
				wb.addShape(cyl, new CANNON.Vec3(), q);
				wb.threemesh = wheelMeshes[wi++];
				wheelBodies.push(wb);
			});
			return { vehicle, wheelBodies };
		}

		// ── Player 1 ──────────────────────────────────────────────────────────
		const posA = this.car.chassis.position.clone();
		posA.y += 1;
		const chassisBodyA = new CANNON.Body({ mass });
		chassisBodyA.addShape(chassisShape);
		chassisBodyA.position.copy(posA);
		chassisBodyA.angularVelocity.set(0, 0, 0);
		chassisBodyA.threemesh = this.car.chassis;

		const selectedWheel = this.car.selected.wheel;
		selectedWheel.children[0].visible = true;
		selectedWheel.children[0].castShadow = true;
		const wheelMeshesA = [selectedWheel];
		for (let i = 0; i < 3; i++){
			const w = selectedWheel.clone();
			this.scene.add(w);
			wheelMeshesA.push(w);
		}
		const { vehicle: vehicleA, wheelBodies: wheelBodiesA } = buildVehicle(chassisBodyA, wheelMeshesA);

		// ── Player 2 ──────────────────────────────────────────────────────────
		const posB = this.car.chassis.position.clone();
		posB.y += 1;
		posB.x += 4;
		const chassisBodyB = new CANNON.Body({ mass });
		chassisBodyB.addShape(new CANNON.Box(new CANNON.Vec3(1, 0.3, 2)));
		chassisBodyB.position.copy(posB);
		chassisBodyB.angularVelocity.set(0, 0, 0);
		chassisBodyB.threemesh = this.car2.chassis;

		const wheelMeshesB = [];
		for (let i = 0; i < 4; i++){
			const w = selectedWheel.clone();
			w.traverse(function(child){
				if (child.isMesh && child.material){
					child.material = child.material.clone();
					child.material.color.r = Math.min(1, child.material.color.r * 0.5 + 0.5);
					child.material.color.g *= 0.3;
					child.material.color.b *= 0.3;
				}
			});
			this.scene.add(w);
			wheelMeshesB.push(w);
		}
		const { vehicle: vehicleB, wheelBodies: wheelBodiesB } = buildVehicle(chassisBodyB, wheelMeshesB);

		this.vehicles = [vehicleA, vehicleB];
		this.vehicle  = vehicleA;

		// ── Follow cameras ─────────────────────────────────────────────────────
		this.followCams = [];
		const followCamA = new THREE.Object3D();
		followCamA.position.copy(this.cameras[0].position);
		this.scene.add(followCamA);
		followCamA.parent = chassisBodyA.threemesh;
		this.followCams.push(followCamA);

		const followCamB = new THREE.Object3D();
		followCamB.position.copy(this.cameras[1].position);
		this.scene.add(followCamB);
		followCamB.parent = chassisBodyB.threemesh;
		this.followCams.push(followCamB);

		this.followCam = followCamA;

		// ── postStep: sync wheels ──────────────────────────────────────────────
		world.addEventListener('postStep', function(){
			let i;
			i = 0;
			vehicleA.wheelInfos.forEach(function(wheel){
				vehicleA.updateWheelTransform(i);
				const t = wheel.worldTransform;
				wheelBodiesA[i].threemesh.position.copy(t.position);
				wheelBodiesA[i].threemesh.quaternion.copy(t.quaternion);
				i++;
			});
			i = 0;
			vehicleB.wheelInfos.forEach(function(wheel){
				vehicleB.updateWheelTransform(i);
				const t = wheel.worldTransform;
				wheelBodiesB[i].threemesh.position.copy(t.position);
				wheelBodiesB[i].threemesh.quaternion.copy(t.quaternion);
				i++;
			});
		});

		this.createColliders();
		this.initLapTimer();

		if (this.debugPhysics) this.debugRenderer = new THREE.CannonDebugRenderer(this.scene, this.world);
	}

	createColliders(){
		const world = this.world;
		const scaleAdjust = 0.90;
		const divisor = 2 / scaleAdjust;
		this.assets.children.forEach(function(child){
			if (child.isMesh && child.name.includes("Collider")){
				child.visible = false;
				const halfExtents = new CANNON.Vec3(child.scale.x/divisor, child.scale.y/divisor, child.scale.z/divisor);
				const box = new CANNON.Box(halfExtents);
				const body = new CANNON.Body({mass:0});
				body.addShape(box);
				body.position.copy(child.position);
				body.quaternion.copy(child.quaternion);
				world.add(body);
			}
		})
	}
	
	joystickCallback( forward, turn ){
		this.js[0].forward = -forward;
		this.js[0].turn    = -turn;
	}

	initP2Keyboard(){
		const game = this;
		const keys = {};

		function update(){
			let forward = 0, turn = 0;
			if (keys['KeyW'])      forward = -1;
			else if (keys['KeyS']) forward =  1;
			if (keys['KeyA'])      turn    =  1;
			else if (keys['KeyD']) turn    = -1;
			game.js[1].forward = forward;
			game.js[1].turn    = turn;
		}

		document.addEventListener('keydown', function(e){ keys[e.code] = true;  update(); });
		document.addEventListener('keyup',   function(e){ keys[e.code] = false; update(); });
	}

    updateDrive( playerID = 0 ){
		const js      = this.js[playerID];
		const vehicle = this.vehicles ? this.vehicles[playerID] : this.vehicle;
		if (!vehicle) return;

		const forward = js.forward;
		const turn    = js.turn;

		const maxSteerVal = 0.5;
		const maxForce    = 800;
		const brakeForce  = 40;

		const speed = vehicle.chassisBody.velocity.length();

		if (playerID === 0) this.sfx.engine.volume = 0.05 + Math.min(speed * 0.008, 0.1);

		const downforce = speed * 14;
		vehicle.chassisBody.applyForce(
			new CANNON.Vec3(0, -downforce, 0),
			vehicle.chassisBody.position
		);

		const steerFactor = Math.max(0.3, 1 - speed * 0.018);
		const steerTarget = maxSteerVal * turn * steerFactor;

		if (this.smoothSteer === undefined) this.smoothSteer = [0, 0];
		this.smoothSteer[playerID] += (steerTarget - this.smoothSteer[playerID]) * 0.25;

		const force = maxForce * forward;

		if (forward !== 0){
			for (let w = 0; w < 4; w++) vehicle.setBrake(0, w);
			for (let w = 0; w < 4; w++) vehicle.applyEngineForce(force, w);
		} else {
			for (let w = 0; w < 4; w++) vehicle.applyEngineForce(0, w);
			for (let w = 0; w < 4; w++) vehicle.setBrake(brakeForce, w);
		}

		vehicle.setSteeringValue(this.smoothSteer[playerID], 2);
		vehicle.setSteeringValue(this.smoothSteer[playerID], 3);

		const speedKmh = Math.round(speed * 10);
		if (playerID === 0){
			const el = document.getElementById('hud-speed-p1');
			if (el) el.textContent = `${speedKmh} km/h`;
		} else {
			const el = document.getElementById('hud-speed-p2');
			if (el) el.textContent = `${speedKmh} km/h`;
		}
	}
	
	onWindowResize() {
		const halfAspect = window.innerWidth / (window.innerHeight / 2);
		this.cameras.forEach(function(cam){
			cam.aspect = halfAspect;
			cam.updateProjectionMatrix();
		});
		this.renderer.setSize( window.innerWidth, window.innerHeight );
	}

	updateCamera(){
		if (!this.followCams) return;

		for (let p = 0; p < 2; p++){
			const fc = this.followCams[p];
			if (!fc || !this.vehicles || !this.vehicles[p]) continue;

			const chassis = this.vehicles[p].chassisBody.threemesh;
			if (!chassis) continue;

			const lookTarget = chassis.position.clone();
			lookTarget.y += 0.3;

			this.cameras[p].position.lerp(
				fc.getWorldPosition(new THREE.Vector3()),
				0.05
			);
			this.cameras[p].lookAt(lookTarget);
		}

		if (this.sun !== undefined){
			this.sun.position.copy( this.cameras[0].position );
			this.sun.position.y += 10;
		}
	}
	
	getAssetsByName(name){
		if (this.assets==undefined) return;
		
		const names = name.split('.');
		let assets = this.assets;
		
		names.forEach(function(name){
			if (assets!==undefined){
				assets = assets.children.find(function(child){ return child.name==name; });
			}
		});
		
		return assets;
	}
								   
	animate() {
		const game = this;
		
		requestAnimationFrame( function(){ game.animate(); } );
		
		const now = Date.now();
		if (this.lastTime===undefined) this.lastTime = now;
		const dt = (Date.now() - this.lastTime)/1000.0;
		this.FPSFactor = dt;
		this.lastTime = now;
		
		if (this.world!==undefined){
			this.updateDrive(0);
			this.updateDrive(1);

			this.world.step(this.fixedTimeStep, dt, 10);
			this.checkLapProgress();

			this.world.bodies.forEach( function(body){
				if ( body.threemesh != undefined){
					body.threemesh.position.copy(body.position);
					body.threemesh.quaternion.copy(body.quaternion);
					if (game.vehicles && (body === game.vehicles[0].chassisBody || body === game.vehicles[1].chassisBody)){
						const elements = body.threemesh.matrix.elements;
						const yAxis = new THREE.Vector3(elements[4], elements[5], elements[6]);
						body.threemesh.position.sub(yAxis.multiplyScalar(0.6));
					}
				}
			});
		}

		this.updateCamera();

		if (this.debugRenderer!==undefined) this.debugRenderer.update();

		// ── Split-screen rendering ─────────────────────────────────────────────
		const w  = window.innerWidth;
		const h  = window.innerHeight;
		const hh = Math.floor(h / 2);

		this.renderer.clear();

		this.renderer.setViewport(0, hh, w, hh);
		this.renderer.setScissor(0, hh, w, hh);
		this.renderer.setScissorTest(true);
		this.renderer.render(this.scene, this.cameras[0]);

		this.renderer.setViewport(0, 0, w, hh);
		this.renderer.setScissor(0, 0, w, hh);
		this.renderer.render(this.scene, this.cameras[1]);

		this.renderer.setScissorTest(false);

		if (this.stats!=undefined) this.stats.update();

	}

	initSocket(){
		if (typeof io === 'undefined') return;
		const game = this;
		this.socket = io();

		this.socket.on('serverInfo', (data) => {
			const urlEl = document.getElementById('hud-controller-url');
			if (urlEl) urlEl.textContent = data.controllerUrl;
			const statusEl = document.getElementById('hud-controller-status');
			if (statusEl) statusEl.textContent = 'Controllers: open URL on phones';
		});

		this.socket.on('gameInput', (data) => {
			const pid = (data.playerID === 0 || data.playerID === 1) ? data.playerID : 0;
			game.js[pid].forward = data.forward;
			game.js[pid].turn    = data.turn;
		});
	}

	initLapTimer(){
		this.lap = {
			startTime: null,
			lastTime: null,
			bestTime: null,
			nextCheckpoint: 0,
			active: false
		};
		this.updateHUD();
	}

	checkLapProgress(){
		if (!this.checkpoints || this.checkpoints.length === 0) return;
		if (!this.vehicles) return;
		const carPos = this.vehicles[0].chassisBody.position;
		const next = this.checkpoints[this.lap.nextCheckpoint];
		const dx = carPos.x - next.position.x;
		const dz = carPos.z - next.position.z;
		if (Math.sqrt(dx*dx + dz*dz) < 4){
			if (this.lap.nextCheckpoint === 0){
				if (this.lap.active){
					const elapsed = (Date.now() - this.lap.startTime) / 1000;
					this.lap.lastTime = elapsed;
					if (this.lap.bestTime === null || elapsed < this.lap.bestTime){
						this.lap.bestTime = elapsed;
					}
				}
				this.lap.startTime = Date.now();
				this.lap.active = true;
			}
			this.lap.nextCheckpoint = (this.lap.nextCheckpoint + 1) % this.checkpoints.length;
			this.updateHUD();
		}
	}

	updateHUD(){
		// lap/best time display removed
	}
}

class SFX{
	constructor(options){
		this.context = options.context;
		const volume = (options.volume!=undefined) ? options.volume : 1.0;
		this.gainNode = this.context.createGain();
		this.gainNode.gain.setValueAtTime(volume, this.context.currentTime);
		this.gainNode.connect(this.context.destination);
		this._loop = (options.loop==undefined) ? false : options.loop;
		this.fadeDuration = (options.fadeDuration==undefined) ? 0.5 : options.fadeDuration;
		this.autoplay = (options.autoplay==undefined) ? false : options.autoplay;
		this.buffer = null;
		
		let codec;
		for(let prop in options.src){
			if (SFX.supportsAudioType(prop)){
				codec = prop;
				break;
			}
		}
		
		if (codec!=undefined){
			this.url = options.src[codec];
			this.load(this.url);
		}else{
			console.warn("Browser does not support any of the supplied audio files");
		}
	}
	
	static supportsAudioType(type) {
		let audio;

		// Allow user to create shortcuts, i.e. just "mp3"
		let formats = {
			mp3: 'audio/mpeg',
			wav: 'audio/wav',
			aif: 'audio/x-aiff',
			ogg: 'audio/ogg'
		};

		if(!audio) audio = document.createElement('audio');

		return audio.canPlayType(formats[type] || type);
	}
	
	load(url) {
  		// Load buffer asynchronously
  		const request = new XMLHttpRequest();
  		request.open("GET", url, true);
  		request.responseType = "arraybuffer";

  		const sfx = this;

  		request.onload = function() {
			// Asynchronously decode the audio file data in request.response
    		sfx.context.decodeAudioData(
      			request.response,
      			function(buffer) {
					if (!buffer) {
						console.error('error decoding file data: ' + sfx.url);
						return;
					}
					sfx.buffer = buffer;
					if (sfx.autoplay) sfx.play();
				},
				function(error) {
					console.error('decodeAudioData error', error);
				}
    		);
  		}

  		request.onerror = function() {
    		console.error('SFX Loader: XHR error');
  		}

  		request.send();
	}
	
	set loop(value){
		this._loop = value;
		if (this.source!=undefined) this.source.loop = value;
	}
	
	play(){
		if (this.buffer==null) return; 
		if (this.source!=undefined) this.source.stop();
		this.source = this.context.createBufferSource();
		this.source.loop = this._loop;
	  	this.source.buffer = this.buffer;
	  	this.source.connect(this.gainNode);
		this.source.start(0);
	}
	
	set volume(value){
		this._volume = value;
		this.gainNode.gain.setTargetAtTime(value, this.context.currentTime + this.fadeDuration, 0);
	}
	
	pause(){
		if (this.source==undefined) return;
		this.source.stop();
	}
	
	stop(){
		if (this.source==undefined) return;
		this.source.stop();
		delete this.source;
	}
}

class JoyStick{
	constructor(options){
		const circle = document.createElement("div");
		circle.style.cssText = "position:absolute; bottom:35px; width:80px; height:80px; background:rgba(126, 126, 126, 0.5); border:#444 solid medium; border-radius:50%; left:50%; transform:translateX(-50%);";
		const thumb = document.createElement("div");
		thumb.style.cssText = "position: absolute; left: 20px; top: 20px; width: 40px; height: 40px; border-radius: 50%; background: #fff;";
		circle.appendChild(thumb);
		document.body.appendChild(circle);
		this.domElement = thumb;
		this.maxRadius = options.maxRadius || 40;
		this.maxRadiusSquared = this.maxRadius * this.maxRadius;
		this.onMove = options.onMove;
		this.game = options.game;
		this.origin = { left:this.domElement.offsetLeft, top:this.domElement.offsetTop };
		this.rotationDamping = options.rotationDamping || 0.06;
		this.moveDamping = options.moveDamping || 0.01;
		if (this.domElement!=undefined){
			const joystick = this;
			if ('ontouchstart' in window){
				this.domElement.addEventListener('touchstart', function(evt){ evt.preventDefault(); joystick.tap(evt); });
			}else{
				this.domElement.addEventListener('mousedown', function(evt){ evt.preventDefault(); joystick.tap(evt); });
			}
		}
	}
	
	getMousePosition(evt){
		let clientX = evt.targetTouches ? evt.targetTouches[0].pageX : evt.clientX;
		let clientY = evt.targetTouches ? evt.targetTouches[0].pageY : evt.clientY;
		return { x:clientX, y:clientY };
	}
	
	tap(evt){
		evt = evt || window.event;
		// get the mouse cursor position at startup:
		this.offset = this.getMousePosition(evt);
		const joystick = this;
		if ('ontouchstart' in window){
			document.ontouchmove = function(evt){ evt.preventDefault(); joystick.move(evt); };
			document.ontouchend =  function(evt){ evt.preventDefault(); joystick.up(evt); };
		}else{
			document.onmousemove = function(evt){ evt.preventDefault(); joystick.move(evt); };
			document.onmouseup = function(evt){ evt.preventDefault(); joystick.up(evt); };
		}
	}
	
	move(evt){
		evt = evt || window.event;
		const mouse = this.getMousePosition(evt);
		// calculate the new cursor position:
		let left = mouse.x - this.offset.x;
		let top = mouse.y - this.offset.y;
		//this.offset = mouse;
		
		const sqMag = left*left + top*top;
		if (sqMag>this.maxRadiusSquared){
			//Only use sqrt if essential
			const magnitude = Math.sqrt(sqMag);
			left /= magnitude;
			top /= magnitude;
			left *= this.maxRadius;
			top *= this.maxRadius;
		}
		// set the element's new position:
		this.domElement.style.top = `${top + this.domElement.clientHeight/2}px`;
		this.domElement.style.left = `${left + this.domElement.clientWidth/2}px`;
		
		const forward = -(top - this.origin.top + this.domElement.clientHeight/2)/this.maxRadius;
		const turn = (left - this.origin.left + this.domElement.clientWidth/2)/this.maxRadius;
		
		if (this.onMove!=undefined) this.onMove.call(this.game, forward, turn);
	}
	
	up(evt){
		if ('ontouchstart' in window){
			document.ontouchmove = null;
			document.ontouchend = null;
		}else{
			document.onmousemove = null;
			document.onmouseup = null;
		}
		this.domElement.style.top = `${this.origin.top}px`;
		this.domElement.style.left = `${this.origin.left}px`;
		
		this.onMove.call(this.game, 0, 0);
	}
}

class Preloader{
	constructor(options){
		this.assets = {};
		for(let asset of options.assets){
			this.assets[asset] = { loaded:0, complete:false };
			this.load(asset);
		}
		this.container = options.container;
		
		if (options.onprogress==undefined){
			this.onprogress = onprogress;
			this.domElement = document.createElement("div");
			this.domElement.style.position = 'absolute';
			this.domElement.style.top = '0';
			this.domElement.style.left = '0';
			this.domElement.style.width = '100%';
			this.domElement.style.height = '100%';
			this.domElement.style.background = '#000';
			this.domElement.style.opacity = '0.7';
			this.domElement.style.display = 'flex';
			this.domElement.style.alignItems = 'center';
			this.domElement.style.justifyContent = 'center';
			this.domElement.style.zIndex = '1111';
			const barBase = document.createElement("div");
			barBase.style.background = '#aaa';
			barBase.style.width = '50%';
			barBase.style.minWidth = '250px';
			barBase.style.borderRadius = '10px';
			barBase.style.height = '15px';
			this.domElement.appendChild(barBase);
			const bar = document.createElement("div");
			bar.style.background = '#22a';
			bar.style.width = '50%';
			bar.style.borderRadius = '10px';
			bar.style.height = '100%';
			bar.style.width = '0';
			barBase.appendChild(bar);
			this.progressBar = bar;
			if (this.container!=undefined){
				this.container.appendChild(this.domElement);
			}else{
				document.body.appendChild(this.domElement);
			}
		}else{
			this.onprogress = options.onprogress;
		}
		
		this.oncomplete = options.oncomplete;
		
		const loader = this;
		function onprogress(delta){
			const progress = delta*100;
			loader.progressBar.style.width = `${progress}%`;
		}
	}
	
	checkCompleted(){
		for(let prop in this.assets){
			const asset = this.assets[prop];
			if (!asset.complete) return false;
		}
		return true;
	}
	
	get progress(){
		let total = 0;
		let loaded = 0;
		
		for(let prop in this.assets){
			const asset = this.assets[prop];
			if (asset.total == undefined){
				loaded = 0;
				break;
			}
			loaded += asset.loaded; 
			total += asset.total;
		}
		
		return loaded/total;
	}
	
	load(url){
		const loader = this;
		var xobj = new XMLHttpRequest();
		xobj.overrideMimeType("application/json");
		xobj.open('GET', url, true); 
		xobj.onreadystatechange = function () {
			  if (xobj.readyState === 4 && xobj.status === 200) {
				  loader.assets[url].complete = true;
				  if (loader.checkCompleted()){
					  if (loader.domElement!=undefined){
						  if (loader.container!=undefined){
							  loader.container.removeChild(loader.domElement);
						  }else{
							  document.body.removeChild(loader.domElement);
						  }
					  }
					  loader.oncomplete();	
				  }
			  }
		};
		xobj.onprogress = function(e){
			const asset = loader.assets[url];
			asset.loaded = e.loaded;
			asset.total = e.total;
			loader.onprogress(loader.progress);
		}
		xobj.send(null);
	}
}