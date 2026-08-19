import type { Activity, HousingStay, Meal, TripDetail } from "../../api"

export function replaceActivityInTrip(trip: TripDetail, updatedActivity: Activity): TripDetail {
  return {
    ...trip,
    backupActivities: trip.backupActivities.map((activity) =>
      activity.id === updatedActivity.id ? updatedActivity : activity,
    ),
    days: trip.days.map((day) => ({
      ...day,
      activities: day.activities.map((activity) =>
        activity.id === updatedActivity.id ? updatedActivity : activity,
      ),
    })),
  }
}

export function replaceMealInTrip(trip: TripDetail, updatedMeal: Meal): TripDetail {
  return {
    ...trip,
    meals: trip.meals.map((meal) => (meal.id === updatedMeal.id ? updatedMeal : meal)),
  }
}

export function replaceHousingStayInTrip(trip: TripDetail, updatedStay: HousingStay): TripDetail {
  return {
    ...trip,
    housingStays: trip.housingStays.map((stay) =>
      stay.id === updatedStay.id ? updatedStay : stay,
    ),
  }
}
