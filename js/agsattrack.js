/*
Copyright 2012 Alex Greenland

   Licensed under the Apache License, Version 2.0 (the "License");
   you may not use this file except in compliance with the License.
   You may obtain a copy of the License at

       http://www.apache.org/licenses/LICENSE-2.0

   Unless required by applicable law or agreed to in writing, software
   distributed under the License is distributed on an "AS IS" BASIS,
   WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   See the License for the specific language governing permissions and
   limitations under the License.
 */  
var agsattrack = function() {
	'use strict';

	var _observers = [];
	var _tles = new AGTLES();
	var ui = null;
    var _views = null;
	var _selected = null;
	var refreshCounter = 0;
	var refreshInterval = 1;
	var _moonPos = null;
	var _sunPos = null;
	var _sunMoon = new AGSUNMOON();
	var _initComplete = false; // Don't like this
	var _speed = 1;
	
	/**
	 * Shim to support animation frames
	 */
	window.requestAnimFrame = (function() {
		return window.requestAnimationFrame
				|| window.webkitRequestAnimationFrame
				|| window.mozRequestAnimationFrame
				|| window.oRequestAnimationFrame
				|| window.msRequestAnimationFrame || function(callback) {
					window.setTimeout(callback, 1000 / 60);
				};
	})();
	

        var _views = {
        '3d' : {
            classname : 'AG3DVIEW',
            active : false,
            index: 1
        },
        'passes' : {
            classname : 'AGPASSESVIEW',
            active : false,
            index: 2
        },
        'sky' : {
            classname : 'AGSKYVIEW',
            active : false,
            index: 4
        },
        'polar' : {
            classname : 'AGPOLARVIEW',
            active : false,
            index: 3
        },
        'list' : {
            classname : 'AGLISTVIEW',
            active : false,
            index: 0
        },
        'timeline' : {
            classname : 'AGTIMELINE',
            active : true,
            index: 5
        },
        'options' : {
            classname : 'AGOPTIONS',
            active : false,
            index: 6
        }        
    };
    
	function bindEvents() {	
		/**
		 * Listen for an event to load a new set of elements
		 */
		jQuery(document).bind('agsattrack.loadelements', function(event, params) {
			_tles.load(params.filename);
		});
		
		/**
		 * Listen for the view being changed. When the view changes stop the current
		 * view from rendering and start the new view rendering.
		 */
		jQuery(document).bind('agsattrack.changeview', function(event, view) {
	
			jQuery.each(_views, function(view, options) {
				if (options.active) {
					options.active = false;
					options.instance.stopRender();
				}
			});
	
			_views[view].active = true;
			_views[view].instance.startRender();
	
			if (_initComplete) {
				calculate(true);
			}
		});


		/**
		 * Listen for an event indicating the observer position is now set. After it is
		 * start the calculation loop.
		 * TODO: Don't like the use of _initComplete in here. This is needed to stop the
		 * agsattrack.changeview event from firing a calculation before an observer is 
		 * available. This is event is fired when the UI tabs are created.
		 *  
		 */
		jQuery(document).bind('agsattrack.locationAvailable', function(event, params) {
			_initComplete = true;
			calculationLoop();		
		});

		jQuery(document).bind('agsattrack.locationUpdated', function(event, params) {
			_initComplete = true;
			calculationLoop();		
		});
		
		jQuery(document).bind('agsattrack.satclicked', function(event, selected) {
			_selected = selected;
			calculate(true);
			jQuery(document).trigger('agsattrack.newsatselected', {selected: _selected});
		});
	
		jQuery(document).bind('agsattrack.forceupdate', function(event) {
			calculate(true);
		});
	}
	
	/**
	 * calculate the position of all selected satellites. At a regular interval fire an
	 * event to let others know that new data is available.
	 * 
	 */
	function calculationLoop() {
		
		function calc() {
			calculate(false);
			setTimeout(calc, AGSETTINGS.getRefreshTimerInterval());
		}
		setTimeout(calc, AGSETTINGS.getRefreshTimerInterval());
	}

	function calculate(forceRefresh) {

		var cDate = new Cesium.JulianDate();
		var julianDate = cDate.getJulianDayNumber() + cDate.getJulianTimeFraction();
		
		calculateSunAndMoon();
		
		if (_tles.getTotalSelected() > 0) {
			var date = new Date();
			_tles.calcAll(date, _observers[0], _selected);
		
			refreshCounter++;
			if (refreshCounter >= refreshInterval || forceRefresh) {
				refreshCounter = 0;
				jQuery(document).trigger('agsattrack.updatesatdata', {selected: _selected});
			}
		} else {
			jQuery(document).trigger('agsattrack.updatesatdata', {selected: _selected});
		}
	}
	
	function calculateSunAndMoon() {
		var cDate = new Cesium.JulianDate();
		var julianDate = cDate.getJulianDayNumber() + cDate.getJulianTimeFraction();

		_moonPos = _sunMoon.getMoonPos(julianDate, 
				{latitude: _observers[0].getLat(), longitude: _observers[0].getLon()});

		_sunPos = _sunMoon.getSunPos(julianDate, 
				{latitude: _observers[0].getLat(), longitude: _observers[0].getLon()});	
	}
	
	return {

		getMoon: function() {
			if (_moonPos === null) {
				calculateSunAndMoon();
			}
			return _moonPos;
		},

		getMoonPhase: function() {
			var cDate = new Cesium.JulianDate();
			var julianDate = cDate.getJulianDayNumber() + cDate.getJulianTimeFraction();			

			return _sunMoon.getMoonPhase(julianDate);
		},
		
		setSelected : function(selected) {
			_selected = selected;
		},
		getSelected : function() {
			return _selected;
		},
		
		getTles : function() {
			return _tles;
		},

		getSatellites : function() {
			return _tles.getSatellites();
		},

		getSatellite : function(index) {
			return _tles.getSatellite(index);
		},
		
		getObservers : function() {
			return _observers;
		},
		
		init : function() {
			var _active = 0;
			
            
			/**
			 * Create instances of the views
			 */
			jQuery.each(_views, function(view, options) {
				options.instance = new window[options.classname];
				options.instance.init();
				if (options.active) {
					_active = view;
				}
			});

            /**
             * Fire up the user Inerface
             */
            ui = new AGUI();

            
			/**
			 * Setup the first observer, this will be the 'Home' observer
			 */
			_observers[0] = new AGOBSERVER().init();

			bindEvents();
			
			jQuery('#viewtabs').tabs('select',_views[_active].index);

			
		}

	}

};