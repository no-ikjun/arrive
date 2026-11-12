plugins { kotlin("jvm") }
java {
    sourceCompatibility = JavaVersion.VERSION_17
    targetCompatibility = JavaVersion.VERSION_17
}
kotlin { compilerOptions { jvmTarget.set(org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17) } }
dependencies { testImplementation("junit:junit:4.13.2") }


// Both the app and NestJS load the same versioned catalog. Do not duplicate coordinates.
val catalogFile = rootProject.layout.projectDirectory.file("contracts/oryong-demo.json")
val generatedCatalogDir = layout.buildDirectory.dir("generated/sources/catalog/kotlin")
val generateOryongCatalog by tasks.registering {
    inputs.file(catalogFile)
    outputs.dir(generatedCatalogDir)
    doLast {
        @Suppress("UNCHECKED_CAST")
        val catalog = groovy.json.JsonSlurper().parse(catalogFile.asFile) as Map<String, Any?>
        fun quoted(value: Any?): String = groovy.json.JsonOutput.toJson(value as String).replace("$", "\\$")
        fun point(value: Any?): String {
            @Suppress("UNCHECKED_CAST")
            val p = value as Map<String, Any?>
            @Suppress("UNCHECKED_CAST")
            val coordinate = p["coordinate"] as Map<String, Number>?
            val position = coordinate?.let { "Coordinate(${it.getValue("latitude").toDouble()}, ${it.getValue("longitude").toDouble()})" } ?: "null"
            return "Place(${quoted(p["id"])}, ${quoted(p["name"])}, ${quoted(p["instructions"])}, $position)"
        }
        val parking = (catalog.getValue("parkingCandidates") as List<*>).joinToString(",\n        ") { point(it) }
        val output = generatedCatalogDir.get().file("com/arrivetogether/domain/OryongDemo.kt").asFile
        output.parentFile.mkdirs()
        output.writeText("""
            |// Generated from contracts/oryong-demo.json. Edit that source, not this file.
            |package com.arrivetogether.domain
            |
            |object OryongDemo {
            |    const val venueId = ${quoted(catalog["venueId"])}
            |    const val catalogVersion = ${quoted(catalog["catalogVersion"])}
            |    const val verification = ${quoted(catalog["verification"])}
            |    const val notice = ${quoted(catalog["notice"])}
            |    val dropoff = ${point(catalog["dropoff"])}
            |    val meeting = ${point(catalog["meetingPoint"])}
            |    val parking = listOf(
            |        $parking
            |    )
            |}
            |
        """.trimMargin())
    }
}
kotlin.sourceSets.named("main") { kotlin.srcDir(generatedCatalogDir) }
tasks.withType<org.jetbrains.kotlin.gradle.tasks.KotlinCompile>().configureEach { dependsOn(generateOryongCatalog) }
