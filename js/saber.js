import {quadSegmentIntersect, windQuad} from './geometry';
import {drawCircle, drawLine, drawPolygon} from './gui';
import {randInt, Vec2, wrapToPi} from './math';

const TIMESTEP = 1 / 60;
const GRAVITY = 500;
const MAX_LIVES = 3;
const NEW_LIFE_EVERY_N_POINTS = 10;

const SABER_DRAG = 2;  // saber drag is viscous (linear)
const ANG_VEL_MAX = Math.PI / (2 * TIMESTEP);
const SABER_HURT_TIME = 1.0;

const MIN_NUM_BALLS = 0;
const MAX_NUM_BALLS = 10;
const NEW_BALL_EVERY_N_POINTS = 10;

const RADIUS = 10;
const BALL_DYING_TIME = 0.1;
const BALL_DRAG = 0.001;  // ball drag is aerodynamic (quadratic)

// speed required to damage a ball
const DAMAGE_SPEED = 1000;

const BALL_COLORS = ['green', 'blue', 'red'];
const SABER_COLOR = 'red';
const HILT_COLOR = 'black';
const BUMPER_COLOR = 'rgb(100, 100, 100)';

const GAME_OVER_MSG =
    '<strong>Game over!</strong> Refresh the page to start again.'


class Bumper {
    constructor(normal, vertices) {
        this.normal = normal.unit();
        this.orth = this.normal.orth();
        this.vertices = vertices;
        this.origin = this.vertices[0];
    }

    draw(ctx) {
        drawPolygon(ctx, this.vertices, BUMPER_COLOR);
    }
}

class Ball {
    constructor(pos, radius, xMax, yMax) {
        this.radius = radius;

        this.xMax = xMax;
        this.yMax = yMax;
        this.screenCenter = new Vec2(xMax / 2, yMax / 2);

        this.enabled = true;

        this.respawn();
        this.vel = Vec2.zero();
    }

    respawn() {
        this.dying = false;
        this.dyingTime = 0;
        this.health = 3;
        this.inCollision = false;

        this.pos = Vec2.zero();
        do {
            this.pos.x = RADIUS + Math.random() * (this.xMax - 2 * RADIUS);
            this.pos.y = RADIUS + Math.random() * this.yMax * 0.5;
        } while (this.pos.subtract(this.screenCenter).length() < this.xMax / 3);
        this.lastPos = this.pos;

        this.vel = Vec2.zero();
        this.vel.x = 2000 * (Math.random() - 0.5);
        this.vel.y = 2000 * (Math.random() - 0.5);
    }

    draw(ctx, done) {
        if (!this.enabled) {
            return;
        }
        let color = BALL_COLORS[this.health - 1];
        let radius = this.radius;
        if (this.dying) {
            color = 'rgba(100, 100, 100, ' +
                (1 - this.dyingTime / BALL_DYING_TIME) + ')';
            radius = this.radius * (1 + 5 * this.dyingTime / BALL_DYING_TIME);
        } else if (!done) {
            drawCircle(ctx, this.lastPos, this.radius, color);
        }

        drawCircle(ctx, this.pos, radius, color);
    }

    collide(bumpers) {
        if (!this.enabled || this.dying) {
            return 0;
        }

        // collide with bumpers
        for (let i = 0; i < bumpers.length; i++) {
            let bumper = bumpers[i];
            const delta = this.pos.subtract(bumper.origin);
            const d = delta.dot(bumper.normal) + this.radius;
            if (d > 0) {
                this.pos = this.pos.subtract(bumper.normal.scale(d));
                if (this.vel.dot(bumper.normal) > 0) {
                    const vn = bumper.normal.scale(this.vel.dot(bumper.normal));
                    const vu = bumper.orth.scale(this.vel.dot(bumper.orth));
                    this.vel = vn.negate().add(vu);
                }
                break;
            }
        }

        // don't leave the screen, except through the bottom edge
        if (this.pos.x < this.radius) {
            this.pos.x = this.radius;
            if (this.vel.x < 0) {
                this.vel.x = -this.vel.x;
            }
        } else if (this.pos.x > this.xMax - this.radius) {
            this.pos.x = this.xMax - this.radius;
            if (this.vel.x > 0) {
                this.vel.x = -this.vel.x;
            }
        }

        if (this.pos.y < this.radius) {
            this.pos.y = this.radius;
            if (this.vel.y < 0) {
                this.vel.y = -this.vel.y;
            }
        } else if (this.pos.y > this.yMax + this.radius) {
            this.respawn();
        }
    }

    updateVelocity(dt) {
        if (!this.enabled) {
            return;
        }

        // increase drag when dying
        let c = BALL_DRAG;
        if (this.dying) {
            c *= 10;
        }
        const drag = this.vel.scale(this.vel.length() * c);
        const acc = (new Vec2(0, GRAVITY)).subtract(drag);
        this.vel = this.vel.add(acc.scale(dt));
    }

    updatePosition(dt) {
        if (!this.enabled) {
            return;
        }
        if (this.dying) {
            this.dyingTime += dt;
            if (this.dyingTime > BALL_DYING_TIME) {
                this.respawn();
            }
        }

        this.lastPos = this.pos;
        this.pos = this.pos.add(this.vel.scale(dt));
    }

    computeSweptRegion(dt) {
        // ball swept region (just a line segment)
        const bv1 = this.pos;
        const bv2 = this.pos.add(this.vel.scale(dt));
        return [bv1, bv2];
    }
}

class Saber {
    constructor(pos, length) {
        this.length = length;

        // state of the hilt
        this.pos = pos;
        this.vel = Vec2.zero();
        this.acc = Vec2.zero();

        // straight up initial state
        this.angle = 0;
        this.angVel = 0;

        // when true, "grab" the saber so that it cannot spin
        this.grab = false;

        // vertices of the swept area
        this.pvs = null;

        this.hurt = false;
        this.hurtTime = 0;
    }

    computeEndPosition() {
        return computeSaberPoint(this.pos, this.angle, this.length);
    }

    draw(ctx, done) {
        // swept region of the blade
        if (this.pvs && !done) {
            drawPolygon(ctx, this.pvs, SABER_COLOR);
        }

        // saber blade
        const end = this.computeEndPosition();
        drawLine(ctx, this.pos, end, SABER_COLOR, 3);

        // saber hilt
        const v1 = computeSaberPoint(this.pos, this.angle, -1.5 * RADIUS);
        const v2 = computeSaberPoint(this.pos, this.angle, 1.5 * RADIUS);

        if (this.hurt) {
            drawCircle(ctx, this.pos, RADIUS, 'rgba(255, 0, 0, 0.5)');
        } else {
            drawCircle(ctx, this.pos, RADIUS, 'rgba(100, 100, 100, 0.5)');
        }

        drawLine(ctx, v1, v2, HILT_COLOR, 4);
    }

    updateVelocity(target, dt) {
        // compute new vel
        // TODO should we do some filtering here?
        let newVel = target.subtract(this.pos).scale(1. / dt);
        let acc = newVel.subtract(this.vel).scale(1. / dt);
        this.vel = newVel;

        if (!this.grab) {
            // pendulum equations of motion
            let angAcc = (acc.x * Math.cos(this.angle) +
                          (GRAVITY - acc.y) * Math.sin(this.angle)) /
                    this.length -
                SABER_DRAG * this.angVel;
            this.angVel += dt * angAcc;
        } else {
            this.angVel = 0;
        }

        // limit angular velocity
        if (this.angVel > ANG_VEL_MAX) {
            this.angVel = ANG_VEL_MAX;
        } else if (this.angVel < -ANG_VEL_MAX) {
            this.angVel = -ANG_VEL_MAX;
        }
    }

    updatePosition(target, dt) {
        this.pos = target;
        this.angle = wrapToPi(this.angle + dt * this.angVel);

        if (this.hurt) {
            this.hurtTime += dt;
            if (this.hurtTime > SABER_HURT_TIME) {
                this.hurt = false;
                this.hurtTime = 0;
            }
        }
    }

    computeSweptRegion(target, dt) {
        // area swept out by the moving saber (approximated as quadrilateral)
        const pv1 = this.pos;
        const pv2 = target;
        const pv3 = this.computeEndPosition();
        const pv4 = computeSaberPoint(
            target, this.angle + dt * this.angVel, this.length);

        const start = pv1.add(pv2).scale(0.5);
        const end = pv3.add(pv4).scale(0.5);

        const pvs = [pv1, pv2, pv3, pv4];
        this.pvs = windQuad(pvs);

        // return the wound vertices of the swept volume as well as the
        // vertices of a line segment approximating the location of the saber
        // in the middle of the region
        return [this.pvs, end.subtract(start).unit()];
    }
}


function computeSaberPoint(position, angle, length) {
    const x = position.x - length * Math.sin(angle);
    const y = position.y - length * Math.cos(angle);
    return new Vec2(x, y);
}


function computeVelocityAlongSaber(baseVel, angle, angVel, length) {
    const x = -length * Math.sin(angle);
    const y = -length * Math.cos(angle);
    const r = new Vec2(y, -x);
    return baseVel.add(r.scale(angVel));
}


class Game {
    constructor(width, height) {
        this.width = width;
        this.height = height;

        // different length depending on screen size
        let saberLength = 0.175 * width;
        if (width < 500) {
            saberLength = 0.25 * width;
        }
        this.saber = new Saber(
            new Vec2(0.5 * this.width, 0.5 * this.height), saberLength);

        // we keep the maximum possible of balls, but just don't update or
        // render the disabled ones
        this.numBalls = 1;
        this.balls = [];
        for (let i = 0; i < MAX_NUM_BALLS; ++i) {
            const x = RADIUS + Math.random() * (width - 2 * RADIUS);
            const y = RADIUS + Math.random() * height * 0.5;
            let ball = new Ball(new Vec2(x, y), RADIUS, width, height);
            if (i >= this.numBalls) {
                ball.enabled = false;
            }
            this.balls.push(ball);
        }

        const bw = 0.4 * width;
        const bh = 0.15 * height;
        const bumpVert1 = [
            new Vec2(0, height - bh), new Vec2(0, height), new Vec2(bw, height)
        ];
        const bumpVert2 = [
            new Vec2(width - bw, height), new Vec2(width, height),
            new Vec2(width, height - bh)
        ];

        this.bumpers = [
            new Bumper(new Vec2(-bh, bw), bumpVert1),
            new Bumper(new Vec2(bh, bw), bumpVert2),
        ];
        this.score = 0;
        this.lives = MAX_LIVES;

        this.started = false;
        this.done = false;  // game over
        this.freeplay = false;
    }

    draw(ctx) {
        ctx.clearRect(0, 0, this.width, this.height);
        this.saber.draw(ctx, this.done);
        this.balls.forEach(ball => ball.draw(ctx, this.done));
        this.bumpers.forEach(bumper => bumper.draw(ctx));
    }

    step(target, dt) {
        if (!this.started || this.done) {
            return;
        }

        this.saber.updateVelocity(target, dt);
        for (let i = 0; i < this.balls.length; i++) {
            this.balls[i].collide(this.bumpers);
            this.balls[i].updateVelocity(dt);
        }

        const [pvs, u] = this.saber.computeSweptRegion(target, dt);

        this.balls.forEach(ball => {
            if (!ball.enabled || ball.dying) {
                return;
            }

            if (!this.freeplay && !this.saber.hurt &&
                this.saber.pos.subtract(ball.pos).length() < 2 * RADIUS) {
                this.saber.hurt = true;
                this.lives--;
                if (this.lives <= 0) {
                    this.done = true;
                    return;
                }
            }

            const bvs = ball.computeSweptRegion(dt);

            const intersect = quadSegmentIntersect(pvs, bvs, ball.radius);
            if (intersect) {
                // contact distance along the saber
                const dist = ball.pos.subtract(this.saber.pos).dot(u);
                const vp = computeVelocityAlongSaber(
                    this.saber.vel, this.saber.angle, this.saber.angVel, dist);

                // make normal point from the saber toward the ball
                let n = u.orth();
                if (ball.pos.subtract(this.saber.pos).dot(n) < 0) {
                    n = n.negate();
                }

                // velocity of pendulum along normal direction
                const vpn = n.dot(vp);

                // if the ball velocity along the normal direction is less than
                // the saber velocity, it takes the max of the saber velocity
                // or the negation of its own velocity (i.e., it elastically
                // collides with the saber)
                const vbn = n.dot(ball.vel);

                const hitSpeed = Math.abs(vpn - vbn);
                if ((!ball.inCollision) && (hitSpeed >= DAMAGE_SPEED)) {
                    ball.health--;
                    if (ball.health <= 0) {
                        this.score++;
                        ball.dying = true;
                        if ((this.score % NEW_BALL_EVERY_N_POINTS === 0) &&
                            (this.numBalls < MAX_NUM_BALLS)) {
                            this.balls[this.numBalls].enabled = true;
                            this.numBalls++;
                        }
                        if (this.score % NEW_LIFE_EVERY_N_POINTS === 0) {
                            this.lives = Math.min(this.lives + 1, MAX_LIVES);
                        }
                        return;
                    }
                }

                if (vbn < vpn) {
                    const vu = u.scale(u.dot(ball.vel));
                    const vn = n.scale(Math.max(vpn, -vbn));
                    ball.vel = vu.add(vn);
                }
            }
            ball.inCollision = intersect;
        });

        // update positions
        this.saber.updatePosition(target, dt);
        this.balls.forEach(ball => ball.updatePosition(dt));
    }
}

function main() {
    const canvas = document.getElementById('canvas');
    const ctx = canvas.getContext('2d');

    const scoreText = document.getElementById('score');
    const livesText = document.getElementById('lives');
    const noteText = document.getElementById('notification');

    const freeplayBox = document.getElementById('freeplay');


    // make actual canvas shape match the display shape
    const w = canvas.offsetWidth;
    canvas.width = w;
    canvas.height = w;

    let game = new Game(canvas.width, canvas.height);
    let target = Vec2.zero();

    // set free-play mode
    game.freeplay = freeplayBox.checked;
    freeplayBox.addEventListener('change', event => {
        game.freeplay = freeplayBox.checked;
        game.score = 0;
    });

    canvas.addEventListener('mousedown', event => {
        game.saber.grab = true;
    });
    document.addEventListener('mouseup', event => {
        game.saber.grab = false;
    });
    canvas.addEventListener('mousemove', event => {
        target = new Vec2(event.offsetX, event.offsetY);
        if (!game.started &&
            target.subtract(game.saber.pos).length() <= RADIUS) {
            game.started = true;
        }
    });

    // alternative touch controls
    const rect = canvas.getBoundingClientRect();
    canvas.addEventListener('touchstart', event => {
        event.preventDefault();

        game.started = true;
        const x = event.changedTouches[0].clientX - rect.left;
        const y = event.changedTouches[0].clientY - rect.top;
        target = new Vec2(x, y);

        // reset saber to be wherever the touch point is
        game.pos = target;
        game.vel = Vec2.zero();
    });
    canvas.addEventListener('touchmove', event => {
        event.preventDefault();
        const x = event.changedTouches[0].clientX - rect.left;
        const y = event.changedTouches[0].clientY - rect.top;
        target = new Vec2(x, y);
    });

    let lastTime = Date.now();
    function loop(time) {
        requestAnimationFrame(loop);

        // milliseconds
        const dt = time - lastTime;
        lastTime = time;

        game.step(target, dt / 1000);
        game.draw(ctx);

        // TODO I want to put these updates elsewhere
        if (game.done) {
            noteText.innerHTML = GAME_OVER_MSG;
        }
        scoreText.innerHTML = game.score;
        if (freeplayBox.checked) {
            livesText.innerHTML = '-';
        } else {
            livesText.innerHTML = game.lives;
        }
    }
    requestAnimationFrame(loop);
}


window.addEventListener('load', main);
