#version 300 es
// 星星的顶点着色器。
//
// 来源：Telegram 官方桌面端渲染器（Icon.hlsl 的 VS 段），逐行翻译成 GLSL ES 3.00。
// 矩阵是列主序、按"矩阵 × 列向量"相乘，与官方的 mul(uMVPMatrix, float4(...)) 等价，
// 所以这里写成 uMVPMatrix * vec4(...) 而不是反过来。
//
// 官方划掉的 `depth` varying 本来就没被片元着色器读过，这里不传。

precision highp float;
// 片元着色器也把 int 声明为 highp：uniform 块同名成员在两段着色器里的精度必须一致
precision highp int;

// 与官方 IconUniforms 逐字段同序、同含义：224 字节 / 56 个 float（std140 布局）。
layout(std140) uniform IconUniforms
{
    mat4 mvp;
    mat4 world;
    vec3 gradientColor1;
    float spec1;
    vec3 gradientColor2;
    float spec2;
    vec3 normalSpecColor;
    float diffuse;
    vec3 backgroundColor;
    float normalSpec;
    float xOffset;
    float alpha;
    float golden;
    float white;
    float time;
    int type;
    int night;
    float padding;
} u;

layout(location = 0) in vec3 vPosition;
layout(location = 1) in vec3 a_Normal;
layout(location = 2) in vec2 a_TexCoordinate;

out vec3 vNormal;
out vec2 vUV;
out vec3 modelViewVertex;

void main()
{
    vUV = a_TexCoordinate;
    vNormal = a_Normal;
    // 官方：output.position = mul(uMVPMatrix, float4(input.vPosition, 1.0))
    gl_Position = u.mvp * vec4(vPosition, 1.0);
    // 名字沿用官方的 modelViewVertex，但存的是模型空间坐标（金星的渐变用它算）
    modelViewVertex = vPosition;
}
