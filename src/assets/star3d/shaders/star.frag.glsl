#version 300 es
// 星星的片元着色器。
//
// 来源：Telegram 官方桌面端渲染器（Icon.hlsl 的 premium_star / golden_star / StarPS），
// 逐行翻译成 GLSL ES 3.00。官方星星与金币共用一个像素着色器，这里只移植星星分支：
// 金币需要另一套"每个 mesh 一个 modelIndex"的常量缓冲，本组件不涉及。
//
// 星星有两套外观，由 golden 在两者之间插值：紫色的 Premium 星和金色的 Stars 星。
// 本组件只用金色（golden = 1）；Premium 分支保留，保证与官方逐行同构。
//
// 与 HLSL 的对应：
//   SV_Position            → gl_Position（顶点着色器）
//   cbuffer Uniforms : b0  → std140 uniform block IconUniforms（同一个 224 字节缓冲）
//   Texture2D.Sample()     → texture()
//   lerp()                 → mix()
//   frac()                 → fract()（金币分支才用，此处没有）
//   mul(M, v)              → M * v
//   SV_Target              → layout(location = 0) out vec4

precision highp float;
// 默认 int 在片元里是 mediump，而顶点里是 highp：不显式声明会让同名 uniform 块
// 的 int 成员（type / night）精度不一致，程序直接链接失败
precision highp int;
precision highp sampler2D;

// 与 C++ 的 IconUniforms 结构体逐字段同序：mvp(16) world(16) 之后
// 是 4 组 vec3 + float，再是 5 个 float + 2 个 int + 1 个 float。
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

// 官方的两个贴图槽：t0 是底色 / 遮罩（白色），t1 是 flecks（闪光）
uniform sampler2D u_Texture;
uniform sampler2D u_NormalMap;

in vec3 vNormal;
in vec2 vUV;
in vec3 modelViewVertex;

layout(location = 0) out vec4 fragColor;

// 与官方 Varyings 同构；片元阶段只是把它们打成一个包传给两个外观函数。
struct Varyings
{
    vec3 vNormal;
    vec2 vUV;
    vec3 modelViewVertex;
};

// 紫色 Premium 星：法线光照 + 两层高光，返回**预乘 alpha** 的颜色。
vec4 premiumStar(in Varyings i)
{
    vec3 cameraPosition = vec3(0.0, 0.0, 100.0);
    vec3 vLightPosition2 = vec3(-400.0, 400.0, 400.0);
    vec3 vLightPosition4 = vec3(0.0, 0.0, 100.0);
    vec3 vLightPositionNormal = vec3(100.0, -200.0, 400.0);

    vec3 vNormalW = normalize((u.world * vec4(i.vNormal, 0.0)).xyz);
    // flecks 贴图放在法线槽上：采样后从 [0,1] 拉回 [-1,1] 当扰动法线
    vec3 vTextureNormal = normalize(texture(u_NormalMap, (i.vUV + vec2(-u.xOffset, u.xOffset)) * 2.0).xyz * 2.0 - 1.0);

    vec3 finalNormal = normalize(vNormalW + vTextureNormal);

    vec3 color = texture(u_Texture, i.vUV).xyz;
    vec3 viewDirectionW = normalize(cameraPosition);

    vec3 angleW = normalize(viewDirectionW + vLightPosition2);
    float specComp2 = max(0.0, dot(vNormalW, angleW));
    specComp2 = pow(specComp2, max(1.0, 128.0)) * u.spec1;

    angleW = normalize(viewDirectionW + vLightPosition4);
    float specComp3 = max(0.0, dot(vNormalW, angleW));
    specComp3 = pow(specComp3, max(1.0, 30.0)) * u.spec2;

    float diffuse = max(dot(vNormalW, viewDirectionW), (1.0 - u.diffuse));

    float mixValue = distance(i.vUV, vec2(1.0, 0.0));
    vec4 gradientColorFinal = vec4(mix(u.gradientColor1, u.gradientColor2, mixValue), 1.0);

    angleW = normalize(viewDirectionW + vLightPositionNormal);
    float normalSpecComp = max(0.0, dot(finalNormal, angleW));
    normalSpecComp = pow(normalSpecComp, max(1.0, 128.0)) * u.normalSpec;

    angleW = normalize(viewDirectionW + vLightPosition2);
    float normalSpecComp2 = max(0.0, dot(finalNormal, angleW));
    normalSpecComp2 = pow(normalSpecComp2, max(1.0, 128.0)) * u.normalSpec;

    vec4 normalSpecFinal = vec4(u.normalSpecColor, 0.0) * (normalSpecComp + normalSpecComp2);
    vec4 specFinal = vec4(color, 0.0) * (specComp2 + specComp3);

    vec4 shaded = gradientColorFinal + specFinal + normalSpecFinal;
    return mix(vec4(u.backgroundColor, 1.0), shaded, diffuse) * u.alpha;
}

// 金色 Stars 星：渐变 + 一组固定方向的镜面高光 + 闪光扰动。
// 官方的每一处高光都是同一个表达式换一个光位，这里照抄、不折成辅助函数，便于逐行对照。
vec4 goldenStar(in Varyings i)
{
    vec3 pos = i.modelViewVertex / 100.0 + 0.5;
    float specTexture = texture(u_Texture, i.vUV).y * clamp(i.vNormal.z, 0.0, 1.0);

    float gradientMix = distance(pos.xy, vec2(1.0, 1.0));
    gradientMix -= 0.05 * specTexture;
    gradientMix = clamp(gradientMix, 0.0, 1.0);
    vec4 color = vec4(mix(u.gradientColor1, u.gradientColor2, gradientMix), 1.0);

    vec3 norm = normalize((u.world * vec4(i.vNormal, 0.0)).xyz);

    // 官方的 normalize(1.0 - 采样值)：先把闪光贴图反相再归一化
    vec3 flecksNormal = normalize(vec3(1.0) - texture(u_NormalMap, (i.vUV + 0.7 * vec2(-u.xOffset, u.xOffset)) * 2.0).xyz);

    vec3 lightPos = vec3(-3.0, -3.0, 20.0);
    vec3 lightDir = normalize(lightPos - pos);
    float diffuse = max(dot(norm, lightDir), 0.0);

    float spec = 0.0;

    lightPos = vec3(-1.0, 0.7, 0.2);
    spec += specTexture * clamp(2.0 * pow(max(dot(normalize(vec3(0.0) - pos), reflect(-normalize(lightPos - pos), norm)), 0.0), 2.0), 0.0, 1.0) / 6.0;
    lightPos = vec3(8.0, 0.7, 0.5);
    spec += specTexture * clamp(2.0 * pow(max(dot(normalize(vec3(0.0) - pos), reflect(-normalize(lightPos - pos), norm)), 0.0), 2.0), 0.0, 1.0) / 6.0;

    lightPos = vec3(-3.0, -3.0, 0.5);
    spec += clamp(2.0 * pow(max(dot(normalize(vec3(0.0) - pos), reflect(-normalize(lightPos - pos), norm)), 0.0), 2.0), 0.0, 1.0) / 4.0;

    lightPos = vec3(4.0, 3.0, 2.5);
    spec += clamp(1.5 * pow(max(dot(normalize(vec3(0.0) - pos), reflect(-normalize(lightPos - pos), norm)), 0.0), 2.0), 0.0, 1.0) / 6.0;

    lightPos = vec3(-33.0, 0.5, 30.0);
    spec += clamp(2.0 * pow(max(dot(normalize(vec3(0.0) - pos), reflect(-normalize(lightPos - pos), norm)), 0.0), 2.0), 0.0, 1.0) / 12.0;

    spec = clamp(spec, 0.0, 0.7);

    lightPos = vec3(10.0, 0.5, 3.3);
    spec += mix(0.8, 1.0, specTexture) * clamp(2.0 * pow(max(dot(normalize(vec3(0.0) - pos), reflect(-normalize(lightPos - pos), norm)), 0.0), 2.0), 0.0, 1.0) / 8.0;

    lightPos = vec3(-10.0, 0.5, 3.7);
    spec += mix(0.8, 1.0, specTexture) * clamp(2.0 * pow(max(dot(normalize(vec3(0.0) - pos), reflect(-normalize(lightPos - pos), norm)), 0.0), 2.0), 0.0, 1.0) / 8.0;

    lightPos = vec3(0.5, 12.0, 1.5);
    spec += mix(0.8, 1.0, specTexture) * clamp(2.0 * pow(max(dot(normalize(vec3(0.0) - pos), reflect(-normalize(lightPos - pos), norm)), 0.0), 2.0), 0.0, 1.0) / 8.0;

    spec = clamp(spec, 0.0, 0.9);

    color = mix(vec4(0.0, 0.0, 0.0, 1.0), color, 0.8 + 0.3 * diffuse);
    vec4 specColor = vec4(mix(1.8, 2.0, specTexture) * u.gradientColor1, 1.0);
    color = mix(color, specColor, spec);

    float flecksSpec = 0.0;
    lightPos = vec3(1.2, -0.2, 0.5);
    flecksSpec += clamp(2.0 * pow(max(dot(normalize(vec3(0.0) - pos), reflect(-normalize(lightPos - pos), norm)), 0.0), 2.0), 0.0, 1.0);

    color = mix(color, specColor,
        clamp(flecksSpec * abs(i.vNormal.z) * (flecksNormal.z), 0.2, 0.3) - 0.2
    );

    // 官方在金色分支里也是预乘 alpha 输出：颜色乘 alpha，alpha 通道单独写
    return mix(color * u.alpha, vec4(1.0, 1.0, 1.0, 1.0), u.white);
}

void main()
{
    Varyings i = Varyings(vNormal, vUV, modelViewVertex);
    // 官方 StarPS：return lerp(premium_star(i), golden_star(i), golden)
    fragColor = mix(premiumStar(i), goldenStar(i), u.golden);
}
