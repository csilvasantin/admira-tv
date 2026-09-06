/* Guided Google Maps 3D shots. Live rendering only: no tile prefetch/storage. */
(function (root) {
  'use strict';
  function number(value, owner) { return typeof value === 'function' ? value.call(owner) : value; }
  function angleDistance(a, b) { return Math.abs(((a - b + 540) % 360) - 180); }
  function cameraEye(camera) {
    const center = camera.center || {};
    const lat = number(center.lat, center), lng = number(center.lng, center);
    const altitude = number(center.altitude, center);
    const rad = Math.PI / 180;
    const horizontal = camera.range * Math.sin(camera.tilt * rad);
    return {
      lat:lat - horizontal * Math.cos(camera.heading * rad) / 111320,
      lng:lng - horizontal * Math.sin(camera.heading * rad) / (111320 * Math.cos(lat * rad)),
      altitude:altitude + camera.range * Math.cos(camera.tilt * rad),
    };
  }
  function atCamera(map, camera) {
    if (!camera.center || !map.center) return false;
    // Google normalizes relative-altitude shots by moving center along the
    // viewing ray and changing range. The eye and orientation remain the same.
    // Compare the eye, not raw center/range, to reject an interrupted flight
    // without rejecting a correctly normalized arrival.
    const actual = cameraEye(map), expected = cameraEye(camera);
    const north = (actual.lat - expected.lat) * 111320;
    const east = (actual.lng - expected.lng) * 111320 * Math.cos(expected.lat * Math.PI / 180);
    return Math.hypot(north, east) < 2
      && angleDistance(map.heading, camera.heading) < 1.5
      && Math.abs(map.tilt - camera.tilt) < 1.5;
  }
  function anchorAltitude(map, camera, aboveGround = 2.5) {
    const eye = cameraEye(map);
    // Reconstruct the requested relative center from the absolute eye. The
    // reported center can be a different intersection with the terrain.
    const ground = eye.altitude - camera.range * Math.cos(camera.tilt * Math.PI / 180) - camera.center.altitude;
    return Number.isFinite(ground) ? ground + aboveGround : null;
  }

  function create(map, {loadTimeout = 12000, requestFrame = root.requestAnimationFrame?.bind(root) || (cb => setTimeout(cb, 0)), cancelFrame = root.cancelAnimationFrame?.bind(root) || clearTimeout} = {}) {
    let active = null, lastReadyCamera = null, steady = false;
    const observeSteady = event => { steady = event.isSteady === true; };
    map.addEventListener('gmp-steadychange', observeSteady);
    function cancel() {
      const previous = active; active = null;
      previous?.abort();
      return map.stopCameraAnimation();
    }
    function step(shot, signal, onPhase) {
      if (!shot.orbit && steady && lastReadyCamera === JSON.stringify(shot.camera) && atCamera(map, shot.camera)) return Promise.resolve('ready');
      return new Promise(resolve => {
        let ended = false, painted = false, settled = false, orbitMoved = false, frame = null;
        const finish = status => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          if (frame !== null) cancelFrame(frame);
          if (status === 'timeout' || status === 'error') root.console?.warn('[BEST camera-path]', JSON.stringify({status,ended,painted,steady,atTarget:atCamera(map,shot.camera),eye:cameraEye(map),targetEye:cameraEye(shot.camera)}));
          map.removeEventListener('gmp-animationend', onEnd);
          map.removeEventListener('gmp-steadychange', onSteady);
          map.removeEventListener('gmp-error', onError);
          map.removeEventListener('gmp-headingchange', onHeading);
          signal.removeEventListener('abort', onAbort);
          if (status === 'ready') lastReadyCamera = JSON.stringify(shot.camera);
          resolve(status);
        };
        const check = () => { if (ended && painted && steady && atCamera(map, shot.camera)) finish('ready'); };
        const onHeading = () => { if (angleDistance(map.heading, shot.camera.heading) > 2) orbitMoved = true; };
        const onEnd = () => {
          if (ended || (shot.orbit && !orbitMoved)) return;
          // stopCameraAnimation also emits animationend. It is not an arrival.
          if (!atCamera(map, shot.camera)) return;
          ended = true; onPhase?.('loading');
          // A cached scene can remain steady through the flight and emit no
          // further steadychange at its endpoint. After two paint frames, use
          // the latest observed steady state, still requiring the target eye.
          frame = requestFrame(() => {
            if (settled || signal.aborted) return;
            frame = requestFrame(() => { if (!settled && !signal.aborted) { painted = true; check(); } });
          });
        };
        const onSteady = event => {
          // The first steadychange can be FALSE. Never treat it as readiness.
          check();
        };
        const onError = () => finish('error');
        const onAbort = () => finish('cancelled');
        const timer = setTimeout(() => finish('timeout'), shot.durationMillis + loadTimeout);
        map.addEventListener('gmp-animationend', onEnd);
        map.addEventListener('gmp-steadychange', onSteady);
        map.addEventListener('gmp-error', onError);
        if (shot.orbit) map.addEventListener('gmp-headingchange', onHeading);
        signal.addEventListener('abort', onAbort, {once:true});
        if (signal.aborted) { finish('cancelled'); return; }
        onPhase?.('moving');
        try {
          const result = shot.orbit
            ? map.flyCameraAround({camera:shot.camera, durationMillis:shot.durationMillis, repeatCount:1})
            : map.flyCameraTo({endCamera:shot.camera, durationMillis:shot.durationMillis});
          // Accommodate API versions returning a promise without depending on it
          // for completion: camera events + steady rendering are authoritative.
          Promise.resolve(result).catch(() => finish('error'));
        } catch (_) { finish('error'); }
      });
    }
    async function run(shots, onProgress) {
      const stopped = cancel();
      const controller = new AbortController(); active = controller;
      try { await stopped; } catch (_) { if (active === controller) active = null; return 'error'; }
      if (controller.signal.aborted) return 'cancelled';
      let status = 'ready';
      for (let index = 0; index < shots.length; index++) {
        if (controller.signal.aborted) return 'cancelled';
        const shot = shots[index];
        status = await step(shot, controller.signal, phase => onProgress?.({index, total:shots.length, shot, phase}));
        if (controller.signal.aborted) return 'cancelled';
        if (status !== 'ready') break;
        onProgress?.({index, total:shots.length, shot, phase:'ready'});
      }
      if (active === controller) {
        active = null;
        if (status !== 'ready') map.stopCameraAnimation();
      }
      return controller.signal.aborted ? 'cancelled' : status;
    }
    return {run, cancel, isRunning: () => !!active, dispose: () => { cancel(); map.removeEventListener('gmp-steadychange', observeSteady); }};
  }
  function waitForPanorama(panorama, pano, signal, timeout = 10000, requestPano) {
    return new Promise(resolve => {
      let settled = false;
      const finish = status => {
        if (settled) return;
        settled = true; clearTimeout(timer);
        listener.remove(); signal.removeEventListener('abort', onAbort);
        resolve(status);
      };
      const check = () => {
        const status = panorama.getStatus();
        if (status === 'OK' && panorama.getPano() === pano) finish('ready');
        else if (status && status !== 'OK') finish('error');
      };
      const onAbort = () => finish('cancelled');
      const listener = panorama.addListener('status_changed', check);
      const timer = setTimeout(() => finish('timeout'), timeout);
      signal.addEventListener('abort', onAbort, {once:true});
      if (signal.aborted) onAbort();
      else if (requestPano) {
        // Subscribe BEFORE setPano and require its fresh status event. getPano
        // can change synchronously while getStatus still says the previous OK.
        try { requestPano(); } catch (_) { finish('error'); }
      } else check();
    });
  }
  root.KioskCameraPath = {create, atCamera, cameraEye, anchorAltitude, waitForPanorama};
})(typeof window === 'undefined' ? globalThis : window);
