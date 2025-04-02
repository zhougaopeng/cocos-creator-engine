/****************************************************************************
 Copyright (c) 2008-2010 Ricardo Quesada
 Copyright (c) 2011-2012 cocos2d-x.org
 Copyright (c) 2013-2016 Chukong Technologies Inc.
 Copyright (c) 2017-2018 Xiamen Yaji Software Co., Ltd.

 http://www.cocos2d-x.org

 Permission is hereby granted, free of charge, to any person obtaining a copy
 of this software and associated documentation files (the "Software"), to deal
 in the Software without restriction, including without limitation the rights
 to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 copies of the Software, and to permit persons to whom the Software is
 furnished to do so, subject to the following conditions:

 The above copyright notice and this permission notice shall be included in
 all copies or substantial portions of the Software.

 THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 THE SOFTWARE.
 ****************************************************************************/

const EventTarget = require("../core/event/event-target");
const sys = require("../core/platform/CCSys");
const LoadMode = require("../core/assets/CCAudioClip").LoadMode;

class NotAllowedError extends Error {
    constructor(message) {
        super(message);
        this.name = "NotAllowedError"; // 定义错误名称
    }
}

let Audio = function (src) {
    EventTarget.call(this);
    this._shouldRecycleOnEnded = false;
    this._src = src;
    this._element = null;
    this.id = 0;
    this._state = Audio.State.INITIALZING;

    const self = this;
    this._onended = function () {
        self._state = Audio.State.STOPPED;
        self.emit("ended");
    };
    this._onendedSecond = function () {
        self._unbindEnded(self._onendedSecond);
        self._bindEnded();
    };
};

cc.js.extend(Audio, EventTarget);

/**
 * !#en Audio state.
 * !#zh 声音播放状态
 * @enum audioEngine.AudioState
 * @memberof cc
 */
// TODO - At present, the state is mixed with two states of users and systems, and it is best to split into two types. A "loading" should also be added to the system state.
Audio.State = {
    /**
     * @property {Number} ERROR
     */
    ERROR: -1,
    /**
     * @property {Number} INITIALZING
     */
    INITIALZING: 0,
    /**
     * @property {Number} PLAYING
     */
    PLAYING: 1,
    /**
     * @property {Number} PAUSED
     */
    PAUSED: 2,
    /**
     * @property {Number} STOPPED
     */
    STOPPED: 3,
};

(function (proto) {
    proto._bindEnded = function (callback) {
        callback = callback || this._onended;
        if (callback._binded) {
            return;
        }
        callback._binded = true;

        let elem = this._element;
        if (this._src && elem instanceof HTMLAudioElement) {
            elem.addEventListener("ended", callback);
        } else {
            elem.onended = callback;
        }
    };

    proto._unbindEnded = function (callback) {
        callback = callback || this._onended;
        if (!callback._binded) {
            return;
        }
        callback._binded = false;

        let elem = this._element;
        if (elem instanceof HTMLAudioElement) {
            elem.removeEventListener("ended", callback);
        } else if (elem) {
            elem.onended = null;
        }
    };

    proto._onLoaded = function () {
        this._createElement();
        this._state = Audio.State.INITIALZING;
        this.setVolume(1);
        this.setLoop(false);
    };

    proto._createElement = function () {
        let elem = this._src._nativeAsset;
        if (elem instanceof HTMLAudioElement) {
            // Reuse dom audio element
            if (!this._element) {
                this._element = document.createElement("audio");
            }
            this._element.src = elem.src;
        } else {
            this._element = new WebAudioElement(elem, this);
        }
    };

    proto.play = function () {
        if (this._state === Audio.State.PLAYING) {
            return;
        }

        let self = this;
        this._src &&
            this._src._ensureLoaded(function () {
                if (!self._element) {
                    return;
                }
                // marked as playing so it will playOnLoad
                self._state = Audio.State.PLAYING;
                // TODO: move to audio event listeners
                self._bindEnded();
                let playPromise = self._element.play();
                // dom audio throws an error if pause audio immediately after playing
                if (window.Promise && playPromise instanceof Promise) {
                    return playPromise.then(() => {
                        self.emit("play");
                        self.emit("playing");
                    });
                }
                self.emit("play");
                self.emit("playing");
            });
    };

    proto.destroy = function () {
        this._element = null;
    };

    proto.pause = function () {
        if (this.getState() !== Audio.State.PLAYING) {
            return;
        }
        let self = this;
        this._src &&
            this._src._ensureLoaded(function () {
                // pause operation may fire 'ended' event
                if (!self._element) {
                    return;
                }
                self._unbindEnded();
                self._element.pause();
                self._state = Audio.State.PAUSED;
                self.emit("pause");
            });
    };

    proto.resume = function () {
        if (this.getState() !== Audio.State.PAUSED) {
            return;
        }
        let self = this;
        this._src &&
            this._src._ensureLoaded(function () {
                if (!self._element) {
                    return;
                }
                self._bindEnded();
                self._element.play();
                self._state = Audio.State.PLAYING;
                self.emit("resume");
                self.emit("playing");
            });
    };

    proto.stop = function () {
        let self = this;
        this._src &&
            this._src._ensureLoaded(function () {
                if (!self._element) {
                    return;
                }

                self._element.pause();
                self._element.currentTime = 0;
                self._unbindEnded();
                self._state = Audio.State.STOPPED;
                self.emit("stop");
            });
    };

    proto.setLoop = function (loop) {
        let self = this;
        this._src &&
            this._src._ensureLoaded(function () {
                self._element.loop = loop;
            });
    };
    proto.getLoop = function () {
        return this._element ? this._element.loop : false;
    };

    proto.setPrevVolume = function (num) {
        this._prevVolume = num;
    };

    proto.getPrevVolume = function () {
        return this._prevVolume || this.getVolume();
    };

    proto.setVolume = function (num) {
        let self = this;
        this._src &&
            this._src._ensureLoaded(function () {
                self._element.volume = num;
                self.emit("volume-change");
            });
    };
    proto.getVolume = function () {
        return this._element ? this._element.volume : 1;
    };

    proto.setCurrentTime = function (num) {
        let self = this;
        this._src &&
            this._src._ensureLoaded(function () {
                // setCurrentTime would fire 'ended' event
                // so we need to change the callback to rebind ended callback after setCurrentTime
                self._unbindEnded();
                self._bindEnded(self._onendedSecond);

                try {
                    self._element.currentTime = num;
                    self.emit("time-change");
                } catch (err) {
                    var _element = self._element;
                    if (_element.addEventListener) {
                        var func = function () {
                            _element.removeEventListener(
                                "loadedmetadata",
                                func
                            );
                            _element.currentTime = num;
                            self.emit("time-change");
                        };
                        _element.addEventListener("loadedmetadata", func);
                    }
                }
            });
    };

    proto.getCurrentTime = function () {
        return this._element ? this._element.currentTime : 0;
    };

    proto.getDuration = function () {
        return this._src ? this._src.duration : 0;
    };

    proto.getState = function (forceUpdating = true) {
        // HACK: in some browser, audio may not fire 'ended' event
        // so we need to force updating the Audio state
        if (forceUpdating) {
            this._forceUpdatingState();
        }
        return this._state;
    };

    proto._forceUpdatingState = function () {
        let elem = this._element;
        if (elem) {
            if (Audio.State.PLAYING === this._state && elem.paused) {
                this._state = Audio.State.STOPPED;
            } else if (Audio.State.STOPPED === this._state && !elem.paused) {
                this._state = Audio.State.PLAYING;
            }
        }
    };

    Object.defineProperty(proto, "src", {
        get: function () {
            return this._src;
        },
        set: function (clip) {
            this._unbindEnded();
            if (clip && clip.isValid) {
                if (clip !== this._src) {
                    this._src = clip;
                    if (!clip.loaded) {
                        let self = this;
                        // need to call clip._ensureLoaded mannually to start loading
                        clip.once("load", function () {
                            // In case set a new src when the old one hasn't finished loading
                            if (clip === self._src) {
                                clip.loaded = true;
                                self._onLoaded();
                                self.emit("loaded");
                            }
                        });
                    } else {
                        this._onLoaded();
                    }
                }
            } else {
                this._src = null;
                if (this._element instanceof WebAudioElement) {
                    this._element = null;
                } else if (this._element) {
                    this._element.src = "";
                }
                this._state = Audio.State.INITIALZING;
            }
        },
        enumerable: true,
        configurable: true,
    });

    Object.defineProperty(proto, "paused", {
        get: function () {
            return this._element ? this._element.paused : true;
        },
        enumerable: true,
        configurable: true,
    });

    // setFinishCallback
})(Audio.prototype);

// TIME_CONSTANT is used as an argument of setTargetAtTime interface
// TIME_CONSTANT need to be a positive number on Edge and Baidu browser
// TIME_CONSTANT need to be 0 by default, or may fail to set volume at the very beginning of playing audio
let TIME_CONSTANT;
if (
    cc.sys.browserType === cc.sys.BROWSER_TYPE_EDGE ||
    cc.sys.browserType === cc.sys.BROWSER_TYPE_BAIDU ||
    cc.sys.browserType === cc.sys.BROWSER_TYPE_UC
) {
    TIME_CONSTANT = 0.01;
} else {
    TIME_CONSTANT = 0;
}

(function () {
    // ios 锁定模式会导致没有AudioContext对象
    var context = sys.__audioSupport.context;
    if (!context) {
        return;
    }

    if (!(sys.os === sys.OS_IOS && sys.isBrowser)) {
        return;
    }

    function resumeAudio() {
        context.resume().catch(console.error);
    }

    let currentTime = context.currentTime;
    function checkAudioContext() {
        if (
            context.state === "running" &&
            context.currentTime === currentTime
        ) {
            context.suspend().then(resumeAudio, resumeAudio);
        }

        currentTime = context.currentTime;
        setTimeout(checkAudioContext, 100);
    }

    setTimeout(checkAudioContext, 100);
})();

function touchResume() {
    const context = sys.__audioSupport.context;
    if (!context) {
        return;
    }

    const state = context.state;
    if (state !== "running" && state !== "closed") {
        context.resume().catch(console.error);
    }
}

if (typeof document !== "undefined") {
    document.addEventListener("touchstart", touchResume, {
        capture: true,
    });
    document.addEventListener("mousedown", touchResume, {
        capture: true,
    });
}

// Encapsulated WebAudio interface
let WebAudioElement = function (buffer, audio) {
    this._audio = audio;
    this._context = sys.__audioSupport.context;
    this._buffer = buffer;

    this._gainObj = this._context["createGain"]();
    this.volume = 1;

    this._gainObj["connect"](this._context["destination"]);
    this._loop = false;
    // The time stamp on the audio time axis when the recording begins to play.
    this._startTime = -1;
    // Record the currently playing 'Source'
    this._currentSource = null;
    // Record the time has been played
    this.playedLength = 0;

    this._endCallback = function () {
        if (this.onended) {
            this.onended(this);
        }
    }.bind(this);
};

(function (proto) {
    proto.play = function (offset) {
        return new Promise((resolve, reject) => {
            try {
                // If repeat play, you need to stop before an audio
                if (this._currentSource && !this.paused) {
                    this._currentSource.onended = null;
                    this._currentSource.stop(0);
                    this.playedLength = 0;
                }

                let audio = this._context["createBufferSource"]();
                audio.buffer = this._buffer;
                audio["connect"](this._gainObj);
                audio.loop = this._loop;

                this._startTime = this._context.currentTime;
                offset = offset || this.playedLength;
                if (offset) {
                    this._startTime -= offset;
                }
                let duration = this._buffer.duration;

                let startTime = offset;
                let endTime;
                if (this._loop) {
                    if (audio.start) audio.start(0, startTime);
                    else if (audio["notoGrainOn"])
                        audio["noteGrainOn"](0, startTime);
                    else audio["noteOn"](0, startTime);
                } else {
                    endTime = duration - offset;
                    if (audio.start) audio.start(0, startTime, endTime);
                    else if (audio["noteGrainOn"])
                        audio["noteGrainOn"](0, startTime, endTime);
                    else audio["noteOn"](0, startTime, endTime);
                }

                this._currentSource = audio;

                audio.onended = this._endCallback;

                let sys = cc.sys;
                if (sys.os === sys.OS_IOS && sys.isBrowser && sys.isMobile) {
                    // Audio context is suspended when you unplug the earphones,
                    // and is interrupted when the app enters background.
                    // Both make the audioBufferSource unplayable.
                    if (
                        (audio.context.state === "suspended" &&
                            this._context.currentTime !== 0) ||
                        audio.context.state === "interrupted"
                    ) {
                        // reference: https://developer.mozilla.org/en-US/docs/Web/API/AudioContext/resume
                        audio.context.resume();
                    }
                }

                // If the current audio context time stamp is 0 and audio context state is suspended
                // There may be a need to touch events before you can actually start playing audio
                if (
                    (!audio.context.state ||
                        audio.context.state === "suspended") &&
                    this._context.currentTime === 0
                ) {
                    // 阻止自动播放
                    reject(new NotAllowedError("do not autoplay"));
                    return;
                }

                resolve();
            } catch (e) {
                reject(e);
            }
        });
    };

    proto.pause = function (clear) {
        if (this.paused) return;
        // Record the time the current has been played
        this.playedLength = this._context.currentTime - this._startTime;
        // If more than the duration of the audio, Need to take the remainder
        this.playedLength %= this._buffer.duration;
        let audio = this._currentSource;
        if (audio) {
            if (audio.onended && clear !== false) {
                audio.onended._binded = false;
                audio.onended = null;
            }
            audio.stop(0);
        }
        this._currentSource = null;
        this._startTime = -1;
    };

    Object.defineProperty(proto, "paused", {
        get: function () {
            // If the current audio is a loop, paused is false
            if (this._currentSource && this._currentSource.loop) return false;

            // startTime default is -1
            if (this._startTime === -1) return true;

            // Current time -  Start playing time > Audio duration
            return (
                this._context.currentTime - this._startTime >
                this._buffer.duration
            );
        },
        enumerable: true,
        configurable: true,
    });

    Object.defineProperty(proto, "loop", {
        get: function () {
            return this._loop;
        },
        set: function (bool) {
            if (this._currentSource) this._currentSource.loop = bool;

            this._loop = bool;
        },
        enumerable: true,
        configurable: true,
    });

    Object.defineProperty(proto, "volume", {
        get: function () {
            return this._volume;
        },
        set: function (num) {
            this._volume = num;
            // https://www.chromestatus.com/features/5287995770929152
            if (this._gainObj.gain.setTargetAtTime) {
                try {
                    this._gainObj.gain.setTargetAtTime(
                        num,
                        this._context.currentTime,
                        TIME_CONSTANT
                    );
                } catch (e) {
                    // Some other unknown browsers may crash if TIME_CONSTANT is 0
                    this._gainObj.gain.setTargetAtTime(
                        num,
                        this._context.currentTime,
                        0.01
                    );
                }
            } else {
                this._gainObj.gain.value = num;
            }

            if (sys.os === sys.OS_IOS && !this.paused && this._currentSource) {
                // IOS must be stop webAudio
                this._currentSource.onended = null;
                this.pause();
                this.play();
            }
        },
        enumerable: true,
        configurable: true,
    });

    Object.defineProperty(proto, "currentTime", {
        get: function () {
            if (this.paused) {
                return this.playedLength;
            }
            // Record the time the current has been played
            this.playedLength = this._context.currentTime - this._startTime;
            // If more than the duration of the audio, Need to take the remainder
            this.playedLength %= this._buffer.duration;
            return this.playedLength;
        },
        set: function (num) {
            if (!this.paused) {
                this.pause(false);
                this.playedLength = num;
                this.play();
            } else {
                this.playedLength = num;
            }
        },
        enumerable: true,
        configurable: true,
    });

    Object.defineProperty(proto, "duration", {
        get: function () {
            return this._buffer.duration;
        },
        enumerable: true,
        configurable: true,
    });
})(WebAudioElement.prototype);

module.exports = cc._Audio = Audio;
