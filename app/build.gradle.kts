plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

val githubClientId: String =
    (project.findProperty("CODEFORGE_GITHUB_CLIENT_ID") as String?)?.takeIf { it.isNotBlank() }
        ?: System.getenv("CODEFORGE_GITHUB_CLIENT_ID")
        ?: ""

android {
    namespace = "dev.codeforge.ide"
    compileSdk = 34

    defaultConfig {
        applicationId = "dev.codeforge.ide"
        minSdk = 26
        targetSdk = 34
        versionCode = 830
        versionName = "8.3.0"

        buildConfigField("String", "GITHUB_CLIENT_ID", "\"$githubClientId\"")

        ndk {
            abiFilters += listOf("arm64-v8a", "armeabi-v7a", "x86_64")
        }
        externalNativeBuild {
            cmake {
                arguments += listOf("-DANDROID_STL=none")
            }
        }
    }

    externalNativeBuild {
        cmake {
            path = file("src/main/cpp/CMakeLists.txt")
            version = "3.22.1"
        }
    }

    signingConfigs {
        create("release") {
            val ks = System.getenv("CF_KEYSTORE_FILE")
            if (ks != null) {
                storeFile = file(ks)
                storePassword = System.getenv("CF_KEYSTORE_PASSWORD")
                keyAlias = System.getenv("CF_KEY_ALIAS")
                keyPassword = System.getenv("CF_KEY_PASSWORD")
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            signingConfig =
                if (System.getenv("CF_KEYSTORE_FILE") != null) signingConfigs.getByName("release")
                else signingConfigs.getByName("debug")
        }
        debug {
            applicationIdSuffix = ".debug"
            versionNameSuffix = "-debug"
        }
    }

    buildFeatures {
        buildConfig = true
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions {
        jvmTarget = "17"
    }

    packaging {
        jniLibs {
            // proot and its loader must exist as real files in nativeLibraryDir so they can be executed.
            useLegacyPackaging = true
        }
        resources {
            excludes += listOf("**/*.map", "META-INF/LICENSE*", "META-INF/NOTICE*")
        }
    }

    androidResources {
        noCompress += listOf("woff", "ttf", "zip", "gz")
    }

    lint {
        abortOnError = false
        checkReleaseBuilds = false
    }
}

dependencies {
    // Only dependency: WebViewAssetLoader (serves bundled assets over https://) and WebMessageListener
    // (origin-restricted JS bridge, so preview iframes can never reach native APIs).
    implementation("androidx.webkit:webkit:1.11.0")
}
