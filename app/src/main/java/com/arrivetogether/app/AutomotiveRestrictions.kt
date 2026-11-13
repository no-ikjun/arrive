package com.arrivetogether.app

import android.car.Car
import android.car.drivingstate.CarUxRestrictions
import android.car.drivingstate.CarUxRestrictionsManager
import android.content.Context
import android.os.Handler
import android.os.Looper

/** Instantiated only on devices advertising automotive; phone emulators need no android.car runtime. */
internal class AutomotiveRestrictions(private val context: Context, private val report: (Boolean?) -> Unit) {
    private var car: Car? = null
    private var manager: CarUxRestrictionsManager? = null
    private var generation = 0
    private val handler = Handler(Looper.getMainLooper())
    fun start() {
        val epoch = ++generation
        report(null)
        try {
            car = Car.createCar(context, handler, Car.CAR_WAIT_TIMEOUT_DO_NOT_WAIT) { connectedCar, ready ->
                if (epoch != generation) return@createCar
                if (!ready) { manager = null; report(null); return@createCar }
                try {
                    val ux = connectedCar.getCarManager(Car.CAR_UX_RESTRICTION_SERVICE) as CarUxRestrictionsManager
                    manager = ux
                    ux.registerListener { restrictions -> if (epoch == generation) publish(restrictions) }
                    publish(ux.currentCarUxRestrictions)
                } catch (_: Exception) { report(null) }
            }
        } catch (_: Exception) { report(null) }
    }
    private fun publish(value: CarUxRestrictions) {
        report(value.isRequiresDistractionOptimization || value.activeRestrictions != CarUxRestrictions.UX_RESTRICTIONS_BASELINE)
    }
    fun stop() {
        generation++
        runCatching { manager?.unregisterListener() }; manager = null
        runCatching { car?.disconnect() }; car = null
        report(null)
    }
}
