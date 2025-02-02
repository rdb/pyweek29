// Based on code from https://github.com/KhronosGroup/glTF-Sample-Viewer

#version 120

#define MAX_LIGHTS 2

uniform struct p3d_MaterialParameters {
    vec4 baseColor;
    float roughness;
    float metallic;
    float refractiveIndex;
} p3d_Material;

uniform struct p3d_LightSourceParameters {
    vec4 position;
    vec4 diffuse;
    vec4 specular;
    vec3 attenuation;
    vec3 spotDirection;
    float spotCosCutoff;
    float spotExponent;
    //sampler2DShadow shadowMap;
    //mat4 shadowMatrix;
} p3d_LightSource[MAX_LIGHTS];

uniform struct p3d_LightModelParameters {
    vec4 ambient;
} p3d_LightModel;

uniform vec4 p3d_ColorScale;

struct FunctionParamters {
    float n_dot_l;
    float n_dot_v;
    float n_dot_h;
    float l_dot_h;
    float v_dot_h;
    float roughness;
    float metallic;
    vec3 reflection0;
    vec3 reflection90;
    vec3 diffuse_color;
    vec3 specular_color;
};

//const vec3 fog_color = vec3(0.6, 1.2, 1.4);
const vec3 fog_color = vec3(0.8, 0.8, 0.9);

// Give texture slots names
#define p3d_TextureBaseColor p3d_Texture0
#define p3d_TextureMetalRoughness p3d_Texture1
#define p3d_TextureNormal p3d_Texture2

uniform sampler2D p3d_TextureBaseColor;
uniform sampler2D p3d_TextureMetalRoughness;
uniform sampler2D p3d_TextureNormal;

const vec3 F0 = vec3(0.04);
const float PI = 3.141592653589793;
const float SPOTSMOOTH = 0.001;
const float LIGHT_CUTOFF = 0.001;

varying vec3 v_position;
varying vec4 v_color;
varying vec2 v_texcoord;
varying vec3 v_normal;

// Schlick's Fresnel approximation
vec3 specular_reflection(FunctionParamters func_params) {
    return func_params.reflection0 + (func_params.reflection90 - func_params.reflection0) * pow(clamp(1.0 - func_params.v_dot_h, 0.0, 1.0), 5.0);
}

// Smith GGX with optional fast sqrt approximation (see https://google.github.io/filament/Filament.md.html#materialsystem/specularbrdf/geometricshadowing(specularg))
float visibility_occlusion(FunctionParamters func_params) {
    float r = func_params.roughness;
    float r2 = r * r;
    float n_dot_l = func_params.n_dot_l;
    float n_dot_v = func_params.n_dot_v;
    float ggxv = n_dot_l * (n_dot_v * (1.0 - r) + r);
    float ggxl = n_dot_v * (n_dot_l * (1.0 - r) + r);

    return max(0.0, 0.5 / (ggxv + ggxl));
}

// GGX/Trowbridge-Reitz
float microfacet_distribution(FunctionParamters func_params) {
    float roughness2 = func_params.roughness * func_params.roughness;
    float f = (func_params.n_dot_h * roughness2 - func_params.n_dot_h) * func_params.n_dot_h + 1.0;
    return roughness2 / (PI * f * f);
}

// Lambert
vec3 diffuse_function(FunctionParamters func_params) {
    return func_params.diffuse_color / PI;
}

void main() {
    if (v_color.a < 0.5) {
        discard;
    }

    vec4 metal_rough = texture2D(p3d_TextureMetalRoughness, v_texcoord);
    float metallic = clamp(p3d_Material.metallic * metal_rough.b, 0.0, 1.0);
    float perceptual_roughness = clamp(p3d_Material.roughness * metal_rough.g,  0.0, 1.0);
    float alpha_roughness = perceptual_roughness * perceptual_roughness;
    vec4 base_color = p3d_Material.baseColor * v_color * p3d_ColorScale * texture2D(p3d_TextureBaseColor, v_texcoord);
    vec3 diffuse_color = (base_color.rgb * (vec3(1.0) - F0)) * (1.0 - metallic);
    vec3 spec_color = mix(F0, base_color.rgb, metallic);
    vec3 reflection90 = vec3(clamp(max(max(spec_color.r, spec_color.g), spec_color.b) * 50.0, 0.0, 1.0));
    vec3 n = v_normal;
    vec3 v = normalize(-v_position);

    vec4 color = vec4(vec3(0.0), base_color.a);

    for (int i = 0; i < 2; ++i) {
        vec3 lightcol = p3d_LightSource[i].diffuse.rgb;

        //if (dot(lightcol, lightcol) < LIGHT_CUTOFF) {
        //    continue;
        //}

        vec3 l = normalize(p3d_LightSource[i].position.xyz - v_position * p3d_LightSource[i].position.w);
        vec3 h = normalize(l + v);
        vec3 r = -normalize(reflect(l, n));

        FunctionParamters func_params;
        func_params.n_dot_l = clamp(dot(n, l), 0.001, 1.0);
        func_params.n_dot_v = clamp(abs(dot(n, v)), 0.001, 1.0);
        func_params.n_dot_h = clamp(dot(n, h), 0.0, 1.0);
        func_params.l_dot_h = clamp(dot(l, h), 0.0, 1.0);
        func_params.v_dot_h = clamp(dot(v, h), 0.0, 1.0);
        func_params.roughness = alpha_roughness;
        func_params.metallic =  metallic;
        func_params.reflection0 = spec_color;
        func_params.reflection90 = reflection90;
        func_params.diffuse_color = diffuse_color;
        func_params.specular_color = spec_color;

        vec3 F = specular_reflection(func_params);
        float V = visibility_occlusion(func_params); // V = G / (4 * n_dot_l * n_dot_v)
        float D = microfacet_distribution(func_params);

        vec3 diffuse_contrib = (1.0 - F) * diffuse_function(func_params);
        vec3 spec_contrib = vec3(F * V * D);
        color.rgb += func_params.n_dot_l * lightcol * (diffuse_contrib + spec_contrib);
    }

    //color.rgb = mix(fog_color, color.rgb, clamp(exp2(0.005 * (-v_position.z - 10) * -1.442695f), 0, 1));
    color.rgb = mix(fog_color, color.rgb, clamp(exp2(0.0001 * (-v_position.z - 10) * (-v_position.z - 10) * -1.442695f), 0, 1));

    gl_FragColor = color;
}
