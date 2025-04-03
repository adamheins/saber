// Wind a set of four vertices into counter-clockwise order
export function windQuad(vertices) {
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

export function quadSegmentIntersect(quad, seg, radius) {
    // use separating axis theorem (SAT): the two shapes are not intersecting
    // if and only if there exists a separating axis between them

    // check segment normal
    const s = seg[1].subtract(seg[0]);
    let n = s.unit().orth();
    let values = projectOnAxis(quad, n, seg[0]);
    // only check if the segment has non-negligible length (otherwise it is
    // basically a point)
    // check in both directions, which is equivalent to checking both
    // outward-facing normals of the segment
    if (s.length() > 1e-3 && (values[0] > radius || values[1] < -radius)) {
        return false;
    }

    // check quad normals
    for (let i = 0; i < 3; i++) {
        // negate to get outward-facing normals
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
