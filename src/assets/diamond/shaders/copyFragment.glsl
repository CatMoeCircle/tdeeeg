#version 300 es
precision highp float;

uniform sampler2D image;
uniform float opacity;
uniform float white;
// Ratio between the render target and the display, plus the box-filter uv step.
uniform float copyTaps;
uniform vec2 copyStep;

in vec2 uv;
out vec4 fragColor;

void main() {
    vec4 c;
    if (copyTaps < 1.5) {
        c = texture(image, uv);
    } else {
        // 3x3 box average: supersampled frames must be resampled properly,
        // otherwise the 1px antialiased rim is lost and the edge turns hard again.
        vec4 sum = vec4(0.0);
        for (int y = -1; y <= 1; y++) {
            for (int x = -1; x <= 1; x++) {
                sum += texture(image, uv + vec2(float(x), float(y)) * copyStep);
            }
        }
        c = sum / 9.0;
    }
    fragColor = vec4(mix(c.rgb, vec3(c.a), white), c.a) * opacity;
}
