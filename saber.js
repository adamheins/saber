const TIMESTEP = 1 / 60;

const LENGTH = 100;
const GRAVITY = 500;
const DRAG = 2;

const ANG_VEL_MAX = Math.PI / (2 * TIMESTEP);

const RADIUS = 10;


function drawCircle(ctx, position, radius, color, fill=true) {
    ctx.beginPath();
    ctx.arc(position.x, position.y, radius, 0, 2 * Math.PI);
    if (fill) {
        ctx.fillStyle = color;
        ctx.fill();
    } else {
        ctx.strokeStyle = color;
        ctx.stroke();
    }
}

function drawPolygon(ctx, vertices, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(vertices[0].x, vertices[0].y);
    for (let i = 1; i < vertices.length; i++) {
        ctx.lineTo(vertices[i].x, vertices[i].y);
    }
    ctx.closePath();
    ctx.fill();
}


function drawLine(ctx, start, end, color, width) {
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(start.x, start.y);
    ctx.lineTo(end.x, end.y);
    ctx.stroke();
}


function wrapToPi(x) {
    // Wrap a value to [-pi, pi]
    while (x > Math.PI) {
        x -= 2 * Math.PI;
    }
    while (x < -Math.PI) {
        x += 2 * Math.PI;
    }
    return x;
}


class Vec2 {
    constructor(x, y) {
        this.x = x;
        this.y = y;
    }

    static zero() {
        return new Vec2(0, 0);
    }

    array() {
        return [this.x, this.y];
    }

    scale(s) {
        return new Vec2(s * this.x, s * this.y);
    }

    negate(s) {
        return new Vec2(-this.x, -this.y);
    }

    dot(other) {
        return this.x * other.x + this.y * other.y;
    }

    add(other) {
        return new Vec2(this.x + other.x, this.y + other.y);
    }

    subtract(other) {
        return new Vec2(this.x - other.x, this.y - other.y);
    }

    rotate(angle) {
        const s = Math.sin(angle);
        const c = Math.cos(angle);
        const x = c * this.x + s * this.y;
        const y = -s * this.x + c * this.y;
        return new Vec2(x, y);
    }

    orth() {
        return new Vec2(this.y, -this.x);
    }

    length() {
        return Math.sqrt(this.dot(this));
    }

    unit() {
        const d = this.length();
        if (d > 0) {
            return this.scale(1 / d);
        }
        return this;
    }
}

class Ball {
    constructor(pos, radius, xMax, yMax) {
        this.radius = radius;

        this.lastPos = pos;
        this.pos = pos;
        this.vel = Vec2.zero();

        this.xMax = xMax;
        this.yMax = yMax;
    }

    draw(ctx) {
        drawCircle(ctx, this.lastPos, this.radius, "blue");
        drawCircle(ctx, this.pos, this.radius, "blue");
    }

    step(dt) {
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

        const acc = (new Vec2(0, GRAVITY)).subtract(this.vel.scale(DRAG));
        this.vel = this.vel.add(acc.scale(dt));
        this.lastPos = this.pos;
        this.pos = this.pos.add(this.vel.scale(dt));
    }
}

// TODO
class Saber {

}


function computePendulumPoint(position, angle, length) {
    const x = position.x - length * Math.sin(angle);
    const y = position.y - length * Math.cos(angle);
    return new Vec2(x, y);
}


function computeVelocityAlongPendulum(baseVel, angle, angVel, length) {
    const x = -length * Math.sin(angle);
    const y = -length * Math.cos(angle);
    const r = new Vec2(-y, x);
    return baseVel.add(r.scale(angVel));
}


// Wind a set of four vertices into counter-clockwise order
function windQuad(vertices) {
    const v1 = vertices[0];
    const v2 = vertices[1];
    const v3 = vertices[2];
    const v4 = vertices[3];

    // inward-facing normal
    const n12 = v2.subtract(v1).orth();
    const d3 = n12.dot(v3.subtract(v1));
    const d4 = n12.dot(v4.subtract(v1));

    if (d3 >= 0 && d4 >= 0) {
        // v2 is next
        const n23 = v3.subtract(v2).orth();
        if (n23.dot(v4.subtract(v2)) >= 0) {
            return [v1, v2, v3, v4];
        } else {
            return [v1, v2, v4, v3];
        }
    } else if (d3 <= 0 && d4 <= 0) {
        // v2 is last
        const n13 = v3.subtract(v1).orth();
        if (n13.dot(v4.subtract(v1)) >= 0) {
            return [v1, v3, v4, v2];
        } else {
            return [v1, v4, v3, v2];
        }
    } else {
        // v2 is the middle
        if (d3 > d4) {
            return [v1, v4, v2, v3];
        } else {
            return [v1, v3, v2, v4];
        }
    }
}

function projectOnAxis(vertices, direction, origin) {
    const values = vertices.map(v => v.subtract(origin).dot(direction));
    return [Math.min(...values), Math.max(...values)];
}

function quadSegmentIntersect(quad, seg, radius) {
    // use separating axis theorem (SAT): the two shapes are not intersecting
    // if and only if there exists a separating axis between them

    // check segment normal
    const s = seg[1].subtract(seg[0]);
    let n = s.unit().orth();
    let values = projectOnAxis(quad, n, seg[0]);
    if (s.length() > 1e-3 && (values[0] > radius || values[1] < -radius)) {
        return false;
    }

    // check quad normals
    for (let i = 0; i < 3; i++) {
        n = quad[i + 1].subtract(quad[i]).unit().orth().negate();
        values = projectOnAxis(seg, n, quad[i]);
        if (values[0] > radius) {
            return false;
        }
    }
    n = quad[0].subtract(quad[3]).unit().orth().negate();
    values = projectOnAxis(seg, n, quad[3]);
    if (values[0] > radius) {
        return false;
    }

    return true;
}


class Game {
    constructor(width, height) {
        this.width = width;
        this.height = height;

        // state of the hilt
        this.pos = new Vec2(0.5 * this.width, 0.5 * this.height);
        this.vel = Vec2.zero();
        this.acc = Vec2.zero();

        // straight up initial state
        this.angle = 0;
        this.angVel = 0;

        // when true, "grab" the saber so that it cannot spin
        this.grab = false;

        this.ball = new Ball(new Vec2(100, 100), RADIUS, width, height);

        // vertices of the swept pendulum area
        this.pvs = null;
    }

    computeEndPosition() {
        return computePendulumPoint(this.pos, this.angle, LENGTH);
    }

    draw(ctx) {
        ctx.clearRect(0, 0, this.width, this.height);

        // swept region of the blade
        if (this.pvs) {
            drawPolygon(ctx, this.pvs, "red");
        }

        // saber blade
        const end = this.computeEndPosition();
        drawLine(ctx, this.pos, end, "red", 3);

        // saber hilt
        const v1 = computePendulumPoint(this.pos, this.angle, -RADIUS);
        const v2 = computePendulumPoint(this.pos, this.angle, RADIUS);
        drawLine(ctx, v1, v2, "black", 4);

        this.ball.draw(ctx);
    }

    step(target, dt) {
        // compute new vel
        let newVel = target.subtract(this.pos).scale(1. / dt);
        let acc = newVel.subtract(this.vel).scale(1. / dt);
        this.vel = newVel;

        if (!this.grab) {
            // pendulum equations of motion
            let angAcc = (acc.x * Math.cos(this.angle) + (GRAVITY - acc.y) * Math.sin(this.angle)) / LENGTH - DRAG * this.angVel;
            this.angVel += dt * angAcc;
        } else {
            this.angVel = 0;
        }

        if (this.angVel > ANG_VEL_MAX) {
            this.angVel = ANG_VEL_MAX;
        } else if (this.angVel < -ANG_VEL_MAX) {
            this.angVel = -ANG_VEL_MAX;
        }

        // pendulum swept region (approximated as quadrilateral)
        const pv1 = this.pos;
        const pv2 = target;
        const pv3 = this.computeEndPosition();
        const pv4 = computePendulumPoint(target, this.angle + dt * this.angVel, LENGTH);
        this.pvs = windQuad([pv1, pv2, pv3, pv4]);

        // ball swept region (just a line segment)
        const bv1 = this.ball.pos;
        const bv2 = this.ball.pos.add(this.ball.vel.scale(dt));

        const intersect = quadSegmentIntersect(this.pvs, [bv1, bv2], this.ball.radius);
        if (intersect) {

            // compute normal the ball hits
            const start = pv1.add(pv2).scale(0.5);
            const end = pv3.add(pv4).scale(0.5);

            const u = end.subtract(start).unit();
            let n = u.orth();

            // contact distance along the pendulum
            const dist = this.ball.pos.subtract(this.pos).dot(u);
            const vp = computeVelocityAlongPendulum(this.vel, this.angle, this.angVel, dist);

            // make normal point in direction of motion
            let vpn = n.dot(vp);
            if (vpn < 0) {
                n = n.negate();
                vpn = -vpn;
            }

            // ball velocity along the normal direction takes on the pendulum
            // velocity if it is less
            const vbn = n.dot(this.ball.vel);
            if (vbn < vpn) {
                const vu = u.scale(u.dot(this.ball.vel));
                const vn = n.scale(vpn);
                this.ball.vel = vu.add(vn);
            }
        }

        // update positions
        this.pos = target;
        this.angle = wrapToPi(this.angle + dt * this.angVel);
        this.ball.step(dt);
    }
}

function main() {
    const canvas = document.getElementById("canvas");
    const ctx = canvas.getContext("2d");

    // make actual canvas shape match the display shape
    const w = canvas.offsetWidth;
    canvas.width = w;
    canvas.height = w;

    let started = false;
    let mouseDown = false;

    let game = new Game(canvas.width, canvas.height);
    let target = Vec2.zero();

    canvas.addEventListener("mousedown", event => {
        game.grab = true;
    });
    document.addEventListener("mouseup", event => {
        game.grab = false;
    });
    canvas.addEventListener("mousemove", event => {
        target = new Vec2(event.offsetX, event.offsetY);
        if (!started && target.subtract(game.pos).length() <= RADIUS) {
            started = true;
        }
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


window.addEventListener("load", main);
