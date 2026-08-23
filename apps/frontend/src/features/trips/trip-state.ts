import type { Activity, HousingStay, Meal, TripDetail } from "../../api"
import { sortActivities } from "../../lib/activity-format"

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

export function moveItemToBackupInTrip(
  trip: TripDetail,
  item: Activity | Meal,
  type: "activity" | "meal",
): TripDetail {
  if (type === "activity") {
    const activity = { ...item, isBackup: true } as Activity
    return {
      ...trip,
      backupActivities: [
        ...trip.backupActivities.filter((currentActivity) => currentActivity.id !== activity.id),
        activity,
      ],
      days: trip.days.map((day) => ({
        ...day,
        activities: day.activities.filter((currentActivity) => currentActivity.id !== activity.id),
      })),
    }
  }

  return {
    ...trip,
    meals: trip.meals.map((meal) => (meal.id === item.id ? { ...meal, isBackup: true } : meal)),
  }
}

export function moveItemToPlanInTrip(
  trip: TripDetail,
  item: Activity | Meal | HousingStay,
  type: "activity" | "meal" | "housing",
): TripDetail {
  if (type === "housing") {
    return {
      ...trip,
      housingStays: trip.housingStays.map((stay) =>
        stay.id === item.id ? { ...(item as HousingStay), isBackup: false } : stay,
      ),
    }
  }

  if (type === "activity") {
    const activity = { ...(item as Activity), isBackup: false }
    return {
      ...trip,
      backupActivities: trip.backupActivities.filter(
        (currentActivity) => currentActivity.id !== activity.id,
      ),
      days: trip.days.map((day) =>
        day.date === activity.tripDate
          ? { ...day, activities: sortActivities([...day.activities, activity]) }
          : day,
      ),
    }
  }

  return {
    ...trip,
    meals: trip.meals.map((meal) =>
      meal.id === item.id ? { ...(item as Meal), isBackup: false } : meal,
    ),
  }
}
