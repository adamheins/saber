import {quadSegmentIntersect, windQuad} from './geometry';
import {drawCircle, drawLine, drawPolygon} from './gui';
import {Vec2, wrapToPi} from './math';

const TIMESTEP = 1 / 60;

const MIN_NUM_BALLS = 0;
const MAX_NUM_BALLS = 10;

const LENGTH = 100;
const GRAVITY = 500;
const SABER_DRAG = 2;  // saber drag is viscous (linear)
const BALL_DRAG = 0.001;  // ball drag is aerodynamic (quadratic)

const ANG_VEL_MAX = Math.PI / (2 * TIMESTEP);

const RADIUS = 10;

const BALL_COLORS = ['blue', 'red', 'green'];
const SABER_COLOR = 'red';
const HILT_COLOR = 'black';


class Ball {
    constructor(pos, radius, xMax, yMax) {
        this.radius = radius;

        this.lastPos = pos;
        this.pos = pos;
        this.vel = Vec2.zero();

        this.xMax = xMax;
        this.yMax = yMax;

        this.enabled = true;
        this.colorIdx = 0;
        this.inCollision = false;
    }

    draw(ctx) {
        if (!this.enabled) {
            return;
        }
        const color = BALL_COLORS[this.colorIdx];
        drawCircle(ctx, this.lastPos, this.radius, color);
        drawCircle(ctx, this.pos, this.radius, color);
    }

    changeColor() {
        this.colorIdx = (this.colorIdx + 1) % BALL_COLORS.length;
    }

    updateVelocity(dt) {
        if (!this.enabled) {
            return;
        }

        // don't leave the screen
        if (this.pos.x < this.radius) {
            this.pos.x = this.radius;
            this.vel.x = -this.vel.x;
        } else if (this.pos.x > this.xMax - this.radius) {
            this.pos.x = this.xMax - this.radius;
            this.vel.x = -this.vel.x;
        }

        if (this.pos.y < this.radius) {
            this.pos.y = this.radius;
            this.vel.y = -this.vel.y;
        } else if (this.pos.y > this.yMax - this.radius) {
            this.pos.y = this.yMax - this.radius;
            this.vel.y = -this.vel.y;
        }

        // const drag = this.vel.scale(DRAG);
        const drag = this.vel.scale(this.vel.length() * BALL_DRAG);
        const acc = (new Vec2(0, GRAVITY)).subtract(drag);
        this.vel = this.vel.add(acc.scale(dt));
    }

    updatePosition(dt) {
        if (!this.enabled) {
            return;
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
    }

    computeEndPosition() {
        return computeSaberPoint(this.pos, this.angle, this.length);
    }


    draw(ctx) {
        // swept region of the blade
        if (this.pvs) {
            drawPolygon(ctx, this.pvs, SABER_COLOR);
        }

        // saber blade
        const end = this.computeEndPosition();
        drawLine(ctx, this.pos, end, SABER_COLOR, 3);

        // saber hilt
        const v1 = computeSaberPoint(this.pos, this.angle, -RADIUS);
        const v2 = computeSaberPoint(this.pos, this.angle, RADIUS);
        drawLine(ctx, v1, v2, HILT_COLOR, 4);
    }

    updateVelocity(target, dt) {
        // compute new vel
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

        this.saber =
            new Saber(new Vec2(0.5 * this.width, 0.5 * this.height), LENGTH);

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

        this.changeColorOnHit = false;
    }

    draw(ctx) {
        ctx.clearRect(0, 0, this.width, this.height);
        this.saber.draw(ctx);
        this.balls.forEach(ball => ball.draw(ctx));
    }

    step(target, dt) {
        this.saber.updateVelocity(target, dt);
        this.balls.forEach(ball => ball.updateVelocity(dt));

        const [pvs, u] = this.saber.computeSweptRegion(target, dt);

        this.balls.forEach(ball => {
            if (!ball.enabled) {
                return;
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
                let vpn = n.dot(vp);

                // if the ball velocity along the normal direction is less than
                // the saber velocity, it takes the max of the saber velocity
                // or the negatation of its own velocity (i.e., it elastically
                // collides with the saber)
                const vbn = n.dot(ball.vel);
                if (vbn < vpn) {
                    const vu = u.scale(u.dot(ball.vel));
                    const vn = n.scale(Math.max(vpn, -vbn));
                    ball.vel = vu.add(vn);
                }

                if (this.changeColorOnHit && !ball.inCollision) {
                    ball.changeColor();
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

    const moreButton = document.getElementById('more');
    const lessButton = document.getElementById('less');
    const colorCheckbox = document.getElementById('colors');

    // make actual canvas shape match the display shape
    const w = canvas.offsetWidth;
    canvas.width = w;
    canvas.height = w;

    let started = false;

    let game = new Game(canvas.width, canvas.height);
    let target = Vec2.zero();

    moreButton.addEventListener('click', event => {
        if (game.numBalls >= MAX_NUM_BALLS) {
            return;
        }
        game.balls[game.numBalls].enabled = true;
        game.numBalls++;
        game.draw(ctx);
    });

    lessButton.addEventListener('click', event => {
        if (game.numBalls <= MIN_NUM_BALLS) {
            return;
        }
        game.numBalls--;
        game.balls[game.numBalls].enabled = false;
        game.draw(ctx);
    });

    // enable/disable changing the ball color when hit by the saber
    game.changeColorOnHit = colorCheckbox.checked;
    colorCheckbox.addEventListener('change', event => {
        game.changeColorOnHit = colorCheckbox.checked;
    });

    canvas.addEventListener('mousedown', event => {
        game.saber.grab = true;
    });
    document.addEventListener('mouseup', event => {
        game.saber.grab = false;
    });
    canvas.addEventListener('mousemove', event => {
        target = new Vec2(event.offsetX, event.offsetY);
        if (!started && target.subtract(game.saber.pos).length() <= RADIUS) {
            started = true;
        }
    });

    // alternative touch controls
    const rect = canvas.getBoundingClientRect();
    canvas.addEventListener('touchstart', event => {
        event.preventDefault();

        started = true;
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
    function loop() {
        // milliseconds
        const now = Date.now();
        const dt = now - lastTime;
        lastTime = now;

        if (started) {
            game.step(target, dt / 1000);
        }
        game.draw(ctx);
    }
    setInterval(loop, 1000 * TIMESTEP);
}


window.addEventListener('load', main);
