import cors from "cors"
import express, {
  type ErrorRequestHandler,
  type NextFunction,
  type Request,
  type Response,
} from "express"
import {
  ActivitySchema,
  CreateActivityInputSchema,
  CreateHousingStayInputSchema,
  CreateMealInputSchema,
  CreateTripInputSchema,
  InviteTripMemberInputSchema,
  HousingStaySchema,
  MealSchema,
  ReorderActivitiesInputSchema,
  ReorderDayItemsInputSchema,
  RequestTripAccessInputSchema,
  SetTripItemPreferenceInputSchema,
  TripCurrencySettingsSchema,
  TripItemPreferenceSchema,
  TripAccessLinkSchema,
  TripAccessRequestSchema,
  TripAccessStatusSchema,
  TripInvitationSchema,
  TripMemberSchema,
  TripSharingSchema,
  TripDaySchema,
  UpdateHousingStayInputSchema,
  UpdateMealInputSchema,
  UpdateTripDayInputSchema,
  UpdateActivityInputSchema,
  UpdateTripInputSchema,
  UpdateTripCurrencySettingsInputSchema,
  TripItemDetailVisibilitySchema,
  UpdateTripItemDetailVisibilityInputSchema,
  isTripDurationWithinLimit,
  type Trip,
  type TripDetail,
  type TripMember,
  type ReorderDayItemInput,
  type UpdateActivityInput,
} from "@turprep/models"
import { createSupabaseAuthService, type AuthenticatedUser, type AuthService } from "./auth.js"
import {
  createSupabaseTripRepository,
  CurrencyRemovalError,
  isDateWithinTrip,
  isValidDateRange,
  type TripRepository,
} from "./trip-repository.js"
import {
  createGooglePlacesResolver,
  GooglePlacesError,
  type GooglePlacesResolver,
} from "./google-places.js"
import { createSharingEmailSender, type SharingEmailSender } from "./sharing-email.js"
import { PRODUCT_NAME } from "./brand.js"

type AuthenticatedRequest = Request & {
  accessToken: string
  user: AuthenticatedUser
}

export type AppDependencies = {
  authService?: AuthService
  tripRepository?: TripRepository
  googlePlacesResolver?: GooglePlacesResolver
  sharingEmailSender?: SharingEmailSender
}

function getAccessToken(request: Request): string | null {
  const authorization = request.header("authorization")

  if (!authorization?.startsWith("Bearer ")) {
    return null
  }

  const token = authorization.slice("Bearer ".length).trim()
  return token || null
}

function getSharingActionUrl(tripId: string, query: string) {
  const appUrl = process.env.FRONTEND_APP_URL ?? "http://localhost:3000"
  return `${appUrl}/trips/${tripId}/request-access?${query}`
}

function getReorderedItemStartTime(trip: TripDetail, item: ReorderDayItemInput) {
  const dayItem =
    item.itemType === "meal"
      ? trip.meals.find((meal) => meal.id === item.itemId)
      : trip.days.flatMap((day) => day.activities).find((activity) => activity.id === item.itemId)

  if (!dayItem || dayItem.allDay) {
    return null
  }

  const time = item.startTime !== undefined ? item.startTime : dayItem.startTime ?? dayItem.endTime
  return time?.trim() || null
}

function hasValidTimedDayItemOrder(trip: TripDetail, items: ReorderDayItemInput[]) {
  const dates = new Set(items.map((item) => item.tripDate))

  return Array.from(dates).every((date) => {
    const timedItems = items
      .filter((item) => item.tripDate === date)
      .sort((left, right) => left.sortOrder - right.sortOrder)
      .map((item) => getReorderedItemStartTime(trip, item))
      .filter((time): time is string => time !== null)

    return timedItems.every((time, index) => index === 0 || timedItems[index - 1] <= time)
  })
}

function requireAuthenticatedUser(
  authService: AuthService,
  request: Request,
  response: Response,
  next: NextFunction,
): void {
  const accessToken = getAccessToken(request)

  if (!accessToken) {
    response.status(401).json({ message: "Authentication required" })
    return
  }

  void authService
    .authenticate(accessToken)
    .then((user) => {
      if (!user) {
        response.status(401).json({ message: "Invalid authentication token" })
        return
      }

      const authenticatedRequest = request as AuthenticatedRequest
      authenticatedRequest.accessToken = accessToken
      authenticatedRequest.user = user
      next()
    })
    .catch(next)
}

export function createApp(dependencies: AppDependencies = {}) {
  const app = express()
  const authService = dependencies.authService ?? createSupabaseAuthService()
  const tripRepository = dependencies.tripRepository ?? createSupabaseTripRepository()
  const googlePlacesResolver = dependencies.googlePlacesResolver ?? createGooglePlacesResolver()
  const sharingEmailSender = dependencies.sharingEmailSender ?? createSharingEmailSender()
  const allowedOrigins = (process.env.CORS_ORIGIN ?? "http://localhost:3000")
    .split(",")
    .map((origin) => origin.trim())

  app.use(cors({ origin: allowedOrigins }))
  app.use(express.json())

  app.get("/api/health", (_request: Request, response: Response) => {
    response.json({
      status: "ok",
      service: "turprep-api",
      timestamp: new Date().toISOString(),
    })
  })

  app.get(
    "/api/trips",
    (request, response, next) => requireAuthenticatedUser(authService, request, response, next),
    async (request: Request, response: Response<Trip[]>, next: NextFunction) => {
      try {
        const authenticatedRequest = request as AuthenticatedRequest
        const trips = await tripRepository.listTrips(
          authenticatedRequest.user.id,
          authenticatedRequest.accessToken,
        )
        response.json(trips)
      } catch (error) {
        next(error)
      }
    },
  )

  app.get(
    "/api/trips/:tripId",
    (request, response, next) => requireAuthenticatedUser(authService, request, response, next),
    async (
      request: Request,
      response: Response<TripDetail | { message: string }>,
      next: NextFunction,
    ) => {
      try {
        const authenticatedRequest = request as AuthenticatedRequest
        const { tripId } = request.params

        if (typeof tripId !== "string") {
          response.status(400).json({ message: "Trip id is required" })
          return
        }

        const trip = await tripRepository.getTrip(
          authenticatedRequest.user.id,
          authenticatedRequest.accessToken,
          tripId,
        )

        if (!trip) {
          response.status(404).json({ message: "Trip not found" })
          return
        }

        response.json(trip)
      } catch (error) {
        next(error)
      }
    },
  )

  app.get(
    "/api/trips/:tripId/currencies",
    (request, response, next) => requireAuthenticatedUser(authService, request, response, next),
    async (request: Request, response: Response, next: NextFunction) => {
      try {
        const authenticatedRequest = request as AuthenticatedRequest
        const { tripId } = request.params
        if (typeof tripId !== "string") {
          response.status(400).json({ message: "Trip id is required" })
          return
        }

        const settings = await tripRepository.getTripCurrencies(
          authenticatedRequest.user.id,
          authenticatedRequest.accessToken,
          tripId,
        )
        if (!settings) {
          response.status(404).json({ message: "Trip not found" })
          return
        }

        response.json(TripCurrencySettingsSchema.parse(settings))
      } catch (error) {
        next(error)
      }
    },
  )

  app.put(
    "/api/trips/:tripId/currencies",
    (request, response, next) => requireAuthenticatedUser(authService, request, response, next),
    async (request: Request, response: Response, next: NextFunction) => {
      try {
        const authenticatedRequest = request as AuthenticatedRequest
        const { tripId } = request.params
        const parsedInput = UpdateTripCurrencySettingsInputSchema.safeParse(request.body)
        if (typeof tripId !== "string" || !parsedInput.success) {
          response.status(400).json({
            message: "Invalid currency settings",
            issues: parsedInput.success ? undefined : parsedInput.error.issues,
          })
          return
        }

        const settings = await tripRepository.updateTripCurrencies(
          authenticatedRequest.user.id,
          authenticatedRequest.accessToken,
          tripId,
          parsedInput.data,
        )
        if (!settings) {
          response.status(404).json({ message: "Trip not found" })
          return
        }

        response.json(TripCurrencySettingsSchema.parse(settings))
      } catch (error) {
        if (error instanceof CurrencyRemovalError) {
          response.status(400).json({ message: error.message, currencies: error.currencies })
          return
        }
        next(error)
      }
    },
  )

  app.patch(
    "/api/trips/:tripId/currencies",
    (request, response, next) => requireAuthenticatedUser(authService, request, response, next),
    async (request: Request, response: Response, next: NextFunction) => {
      try {
        const authenticatedRequest = request as AuthenticatedRequest
        const { tripId } = request.params
        const parsedInput = UpdateTripCurrencySettingsInputSchema.safeParse(request.body)
        if (typeof tripId !== "string" || !parsedInput.success) {
          response.status(400).json({ message: "Invalid currency settings" })
          return
        }

        const settings = await tripRepository.updateTripCurrencies(
          authenticatedRequest.user.id,
          authenticatedRequest.accessToken,
          tripId,
          parsedInput.data,
        )
        if (!settings) {
          response.status(404).json({ message: "Trip not found" })
          return
        }

        response.json(TripCurrencySettingsSchema.parse(settings))
      } catch (error) {
        if (error instanceof CurrencyRemovalError) {
          response.status(400).json({ message: error.message, currencies: error.currencies })
          return
        }
        next(error)
      }
    },
  )

  {
    const itemDetailVisibilityPath = "/api/trips/:tripId/item-detail-visibility"
    const authenticate = (request: Request, response: Response, next: NextFunction) =>
      requireAuthenticatedUser(authService, request, response, next)
    const updateItemDetailVisibility = async (
      request: Request,
      response: Response,
      next: NextFunction,
    ) => {
      try {
        const authenticatedRequest = request as AuthenticatedRequest
        const { tripId } = request.params
        const parsedInput = UpdateTripItemDetailVisibilityInputSchema.safeParse(request.body)
        if (typeof tripId !== "string" || !parsedInput.success) {
          response.status(400).json({ message: "Invalid visibility settings" })
          return
        }

        const settings = await tripRepository.updateTripItemDetailVisibility(
          authenticatedRequest.user.id,
          authenticatedRequest.accessToken,
          tripId,
          parsedInput.data,
        )
        if (!settings) {
          response.status(404).json({ message: "Trip not found" })
          return
        }

        response.json(TripItemDetailVisibilitySchema.parse(settings))
      } catch (error) {
        next(error)
      }
    }

    app.put(itemDetailVisibilityPath, authenticate, updateItemDetailVisibility)
  }

  app.get(
    "/api/trips/:tripId/sharing",
    (request, response, next) => requireAuthenticatedUser(authService, request, response, next),
    async (request: Request, response: Response, next: NextFunction) => {
      try {
        const authenticatedRequest = request as AuthenticatedRequest
        const { tripId } = request.params
        if (typeof tripId !== "string") {
          response.status(400).json({ message: "Trip id is required" })
          return
        }

        const sharing = await tripRepository.getTripSharing(
          authenticatedRequest.user.id,
          authenticatedRequest.accessToken,
          tripId,
        )

        if (!sharing) {
          response.status(404).json({ message: "Trip not found" })
          return
        }

        response.json(TripSharingSchema.parse(sharing))
      } catch (error) {
        next(error)
      }
    },
  )

  app.put(
    "/api/trips/:tripId/preferences",
    (request, response, next) => requireAuthenticatedUser(authService, request, response, next),
    async (request: Request, response: Response, next: NextFunction) => {
      try {
        const authenticatedRequest = request as AuthenticatedRequest
        const { tripId } = request.params
        const parsedInput = SetTripItemPreferenceInputSchema.safeParse(request.body)

        if (typeof tripId !== "string" || !parsedInput.success) {
          response.status(400).json({ message: "Invalid preference data" })
          return
        }

        const preference = await tripRepository.setTripItemPreference(
          authenticatedRequest.user.id,
          authenticatedRequest.accessToken,
          tripId,
          parsedInput.data,
        )

        if (parsedInput.data.value !== null && !preference) {
          response.status(404).json({ message: "Trip item not found" })
          return
        }

        response.json(preference ? TripItemPreferenceSchema.parse(preference) : null)
      } catch (error) {
        next(error)
      }
    },
  )

  app.post(
    "/api/trips/:tripId/sharing/invitations",
    (request, response, next) => requireAuthenticatedUser(authService, request, response, next),
    async (request: Request, response: Response, next: NextFunction) => {
      try {
        const authenticatedRequest = request as AuthenticatedRequest
        const { tripId } = request.params
        const parsedInput = InviteTripMemberInputSchema.safeParse(request.body)
        if (typeof tripId !== "string" || !parsedInput.success) {
          response.status(400).json({ message: "Invalid invitation data" })
          return
        }

        const invitation = await tripRepository.createTripInvitation(
          authenticatedRequest.user.id,
          authenticatedRequest.accessToken,
          tripId,
          parsedInput.data,
        )
        if (!invitation) {
          response.status(404).json({ message: "Trip not found" })
          return
        }

        await sharingEmailSender.send({
          to: invitation.email,
          subject: "You have been invited to collaborate on a trip",
          actionUrl: getSharingActionUrl(
            tripId,
            `invitationId=${encodeURIComponent(invitation.id)}`,
          ),
          actionLabel: "Request access",
        })

        response.status(201).json(TripInvitationSchema.parse(invitation))
      } catch (error) {
        next(error)
      }
    },
  )

  app.post(
    "/api/trips/:tripId/sharing/access-links",
    (request, response, next) => requireAuthenticatedUser(authService, request, response, next),
    async (request: Request, response: Response, next: NextFunction) => {
      try {
        const authenticatedRequest = request as AuthenticatedRequest
        const { tripId } = request.params
        if (typeof tripId !== "string") {
          response.status(400).json({ message: "Trip id is required" })
          return
        }

        const link = await tripRepository.createTripAccessLink(
          authenticatedRequest.user.id,
          authenticatedRequest.accessToken,
          tripId,
        )
        if (!link) {
          response.status(404).json({ message: "Trip not found" })
          return
        }

        response.status(201).json(TripAccessLinkSchema.parse(link))
      } catch (error) {
        next(error)
      }
    },
  )

  app.post(
    "/api/trips/:tripId/sharing/access-requests",
    (request, response, next) => requireAuthenticatedUser(authService, request, response, next),
    async (request: Request, response: Response, next: NextFunction) => {
      try {
        const authenticatedRequest = request as AuthenticatedRequest
        const { tripId } = request.params
        const parsedInput = RequestTripAccessInputSchema.safeParse(request.body)
        if (
          typeof tripId !== "string" ||
          !parsedInput.success ||
          !authenticatedRequest.user.email
        ) {
          response.status(400).json({ message: "Invalid access request data" })
          return
        }

        const accessStatus = await tripRepository.requestTripAccess(
          authenticatedRequest.user.id,
          authenticatedRequest.accessToken,
          tripId,
          authenticatedRequest.user.email,
          authenticatedRequest.user.name,
          parsedInput.data,
        )
        if (!accessStatus) {
          response.status(404).json({ message: "Invitation or access link not found" })
          return
        }

        if (accessStatus.status === "pending" && accessStatus.isNew) {
          const ownerEmail = await tripRepository.getTripOwnerEmail(
            authenticatedRequest.user.id,
            authenticatedRequest.accessToken,
            tripId,
          )
          if (ownerEmail) {
            await sharingEmailSender.send({
              to: ownerEmail,
              subject: "A user has requested access to your trip",
              actionUrl: `${process.env.FRONTEND_APP_URL ?? "http://localhost:3000"}/trips/${tripId}`,
              actionLabel: "Review access request",
            })
          }
        }

        response
          .status(accessStatus.isNew ? 201 : 200)
          .json(TripAccessStatusSchema.parse(accessStatus))
      } catch (error) {
        next(error)
      }
    },
  )

  app.get(
    "/api/trips/:tripId/sharing/access-status",
    (request, response, next) => requireAuthenticatedUser(authService, request, response, next),
    async (request: Request, response: Response, next: NextFunction) => {
      try {
        const authenticatedRequest = request as AuthenticatedRequest
        const { tripId } = request.params
        if (typeof tripId !== "string") {
          response.status(400).json({ message: "Trip id is required" })
          return
        }

        const accessStatus = await tripRepository.getTripAccessStatus(
          authenticatedRequest.user.id,
          authenticatedRequest.accessToken,
          tripId,
        )
        response.json(TripAccessStatusSchema.parse(accessStatus))
      } catch (error) {
        next(error)
      }
    },
  )

  app.patch(
    "/api/trips/:tripId/sharing/requests/:requestId/approve",
    (request, response, next) => requireAuthenticatedUser(authService, request, response, next),
    async (request: Request, response: Response, next: NextFunction) => {
      try {
        const authenticatedRequest = request as AuthenticatedRequest
        const { tripId, requestId } = request.params
        if (typeof tripId !== "string" || typeof requestId !== "string") {
          response.status(400).json({ message: "Access request id is required" })
          return
        }

        const member = await tripRepository.approveTripAccessRequest(
          authenticatedRequest.user.id,
          authenticatedRequest.accessToken,
          tripId,
          requestId,
        )
        if (!member) {
          response.status(404).json({ message: "Access request not found" })
          return
        }

        if (member.email) {
          await sharingEmailSender.send({
            to: member.email,
            subject: "Your trip access request was approved",
            actionUrl: `${process.env.FRONTEND_APP_URL ?? "http://localhost:3000"}/trips/${tripId}`,
            actionLabel: "Open trip",
          })
        }

        response.json(TripMemberSchema.parse(member))
      } catch (error) {
        next(error)
      }
    },
  )

  app.patch(
    "/api/trips/:tripId/sharing/requests/:requestId/deny",
    (request, response, next) => requireAuthenticatedUser(authService, request, response, next),
    async (request: Request, response: Response, next: NextFunction) => {
      try {
        const authenticatedRequest = request as AuthenticatedRequest
        const { tripId, requestId } = request.params
        if (typeof tripId !== "string" || typeof requestId !== "string") {
          response.status(400).json({ message: "Access request id is required" })
          return
        }

        const accessRequest = await tripRepository.denyTripAccessRequest(
          authenticatedRequest.user.id,
          authenticatedRequest.accessToken,
          tripId,
          requestId,
        )
        if (!accessRequest) {
          response.status(404).json({ message: "Access request not found" })
          return
        }

        await sharingEmailSender.send({
          to: accessRequest.email,
          subject: "Your trip access request was denied",
          actionUrl: `${process.env.FRONTEND_APP_URL ?? "http://localhost:3000"}/`,
          actionLabel: `Open ${PRODUCT_NAME}`,
        })

        response.json(TripAccessRequestSchema.parse(accessRequest))
      } catch (error) {
        next(error)
      }
    },
  )

  app.patch(
    "/api/trips/:tripId/sharing/invitations/:invitationId/revoke",
    (request, response, next) => requireAuthenticatedUser(authService, request, response, next),
    async (request: Request, response: Response, next: NextFunction) => {
      try {
        const authenticatedRequest = request as AuthenticatedRequest
        const { tripId, invitationId } = request.params
        if (typeof tripId !== "string" || typeof invitationId !== "string") {
          response.status(400).json({ message: "Invitation id is required" })
          return
        }

        const invitation = await tripRepository.revokeTripInvitation(
          authenticatedRequest.user.id,
          authenticatedRequest.accessToken,
          tripId,
          invitationId,
        )
        if (!invitation) {
          response.status(404).json({ message: "Invitation not found" })
          return
        }

        response.json(TripInvitationSchema.parse(invitation))
      } catch (error) {
        next(error)
      }
    },
  )

  app.patch(
    "/api/trips/:tripId/sharing/access-links/:linkId/revoke",
    (request, response, next) => requireAuthenticatedUser(authService, request, response, next),
    async (request: Request, response: Response, next: NextFunction) => {
      try {
        const authenticatedRequest = request as AuthenticatedRequest
        const { tripId, linkId } = request.params
        if (typeof tripId !== "string" || typeof linkId !== "string") {
          response.status(400).json({ message: "Access link id is required" })
          return
        }

        const link = await tripRepository.revokeTripAccessLink(
          authenticatedRequest.user.id,
          authenticatedRequest.accessToken,
          tripId,
          linkId,
        )
        if (!link) {
          response.status(404).json({ message: "Access link not found" })
          return
        }

        response.json(TripAccessLinkSchema.parse(link))
      } catch (error) {
        next(error)
      }
    },
  )

  app.delete(
    "/api/trips/:tripId/sharing/members/:memberId",
    (request, response, next) => requireAuthenticatedUser(authService, request, response, next),
    async (request: Request, response: Response, next: NextFunction) => {
      try {
        const authenticatedRequest = request as AuthenticatedRequest
        const { tripId, memberId } = request.params
        if (typeof tripId !== "string" || typeof memberId !== "string") {
          response.status(400).json({ message: "Member id is required" })
          return
        }

        const removed = await tripRepository.removeTripMember(
          authenticatedRequest.user.id,
          authenticatedRequest.accessToken,
          tripId,
          memberId,
        )
        if (!removed) {
          response.status(404).json({ message: "Member not found" })
          return
        }

        if (removed.email) {
          await sharingEmailSender.send({
            to: removed.email,
            subject: "Your access to a trip was removed",
            actionUrl: `${process.env.FRONTEND_APP_URL ?? "http://localhost:3000"}/`,
            actionLabel: `Open ${PRODUCT_NAME}`,
          })
        }

        response.status(204).send()
      } catch (error) {
        next(error)
      }
    },
  )

  app.patch(
    "/api/trips/:tripId",
    (request, response, next) => requireAuthenticatedUser(authService, request, response, next),
    async (request: Request, response: Response, next: NextFunction) => {
      try {
        const authenticatedRequest = request as AuthenticatedRequest
        const { tripId } = request.params

        if (typeof tripId !== "string") {
          response.status(400).json({ message: "Trip id is required" })
          return
        }

        const parsedInput = UpdateTripInputSchema.safeParse(request.body)

        if (!parsedInput.success) {
          response.status(400).json({
            message: "Invalid trip data",
            issues: parsedInput.error.issues,
          })
          return
        }

        const currentTrip = await tripRepository.getTrip(
          authenticatedRequest.user.id,
          authenticatedRequest.accessToken,
          tripId,
        )

        if (!currentTrip) {
          response.status(404).json({ message: "Trip not found" })
          return
        }

        const nextTrip = {
          id: currentTrip.id,
          name: parsedInput.data.name ?? currentTrip.name,
          startDate: parsedInput.data.startDate ?? currentTrip.startDate,
          endDate: parsedInput.data.endDate ?? currentTrip.endDate,
          notes: parsedInput.data.notes === undefined ? currentTrip.notes : parsedInput.data.notes,
        }

        if (!isValidDateRange(nextTrip.startDate, nextTrip.endDate)) {
          response.status(400).json({
            message: "The trip end date must be on or after the start date",
          })
          return
        }

        if (!isTripDurationWithinLimit(nextTrip.startDate, nextTrip.endDate)) {
          response.status(400).json({
            message: "Trips cannot be longer than 60 days",
          })
          return
        }

        const activities = currentTrip.days.flatMap((day) => day.activities)
        const activityOutsideTrip = activities.some(
          (activity) =>
            activity.tripDate !== null && !isDateWithinTrip(nextTrip, activity.tripDate),
        )

        if (activityOutsideTrip) {
          response.status(400).json({
            message: "The new trip dates cannot exclude existing activities",
          })
          return
        }

        const trip = await tripRepository.updateTrip(
          authenticatedRequest.user.id,
          authenticatedRequest.accessToken,
          tripId,
          parsedInput.data,
        )

        if (!trip) {
          response.status(404).json({ message: "Trip not found" })
          return
        }

        response.json(trip)
      } catch (error) {
        if (error instanceof CurrencyRemovalError) {
          response.status(400).json({ message: error.message })
          return
        }
        next(error)
      }
    },
  )

  app.patch(
    "/api/trips/:tripId/days/:tripDate",
    (request, response, next) => requireAuthenticatedUser(authService, request, response, next),
    async (request: Request, response: Response, next: NextFunction) => {
      try {
        const authenticatedRequest = request as AuthenticatedRequest
        const { tripId, tripDate } = request.params

        if (typeof tripId !== "string" || typeof tripDate !== "string") {
          response.status(400).json({ message: "Trip id and date are required" })
          return
        }

        const parsedInput = UpdateTripDayInputSchema.safeParse(request.body)

        if (!parsedInput.success) {
          response.status(400).json({
            message: "Invalid day data",
            issues: parsedInput.error.issues,
          })
          return
        }

        const trip = await tripRepository.getTrip(
          authenticatedRequest.user.id,
          authenticatedRequest.accessToken,
          tripId,
        )

        if (!trip) {
          response.status(404).json({ message: "Trip not found" })
          return
        }

        if (!isDateWithinTrip(trip, tripDate)) {
          response.status(400).json({ message: "The day must be within the trip dates" })
          return
        }

        const day = await tripRepository.updateDay(
          authenticatedRequest.user.id,
          authenticatedRequest.accessToken,
          tripId,
          tripDate,
          parsedInput.data,
        )

        if (!day) {
          response.status(404).json({ message: "Day not found" })
          return
        }

        response.json(TripDaySchema.parse(day))
      } catch (error) {
        next(error)
      }
    },
  )

  app.delete(
    "/api/trips/:tripId",
    (request, response, next) => requireAuthenticatedUser(authService, request, response, next),
    async (request: Request, response: Response, next: NextFunction) => {
      try {
        const authenticatedRequest = request as AuthenticatedRequest
        const { tripId } = request.params

        if (typeof tripId !== "string") {
          response.status(400).json({ message: "Trip id is required" })
          return
        }

        const deleted = await tripRepository.deleteTrip(
          authenticatedRequest.user.id,
          authenticatedRequest.accessToken,
          tripId,
        )

        if (!deleted) {
          response.status(404).json({ message: "Trip not found" })
          return
        }

        response.status(204).send()
      } catch (error) {
        next(error)
      }
    },
  )

  app.post(
    "/api/trips",
    (request, response, next) => requireAuthenticatedUser(authService, request, response, next),
    async (
      request: Request,
      response: Response<Trip | { message: string; issues?: unknown }>,
      next: NextFunction,
    ) => {
      try {
        const parsedInput = CreateTripInputSchema.safeParse(request.body)

        if (!parsedInput.success) {
          response.status(400).json({
            message: "Invalid trip data",
            issues: parsedInput.error.issues,
          })
          return
        }

        if (!isValidDateRange(parsedInput.data.startDate, parsedInput.data.endDate)) {
          response.status(400).json({
            message: "The trip end date must be on or after the start date",
          })
          return
        }

        if (!isTripDurationWithinLimit(parsedInput.data.startDate, parsedInput.data.endDate)) {
          response.status(400).json({
            message: "Trips cannot be longer than 60 days",
          })
          return
        }

        const authenticatedRequest = request as AuthenticatedRequest
        const trip = await tripRepository.createTrip(
          authenticatedRequest.user.id,
          authenticatedRequest.accessToken,
          parsedInput.data,
          authenticatedRequest.user.email,
          authenticatedRequest.user.name,
        )
        response.status(201).json(trip)
      } catch (error) {
        next(error)
      }
    },
  )

  app.post(
    "/api/trips/:tripId/housing",
    (request, response, next) => requireAuthenticatedUser(authService, request, response, next),
    async (request: Request, response: Response, next: NextFunction) => {
      try {
        const authenticatedRequest = request as AuthenticatedRequest
        const { tripId } = request.params

        if (typeof tripId !== "string") {
          response.status(400).json({ message: "Trip id is required" })
          return
        }

        const parsedInput = CreateHousingStayInputSchema.safeParse(request.body)

        if (!parsedInput.success) {
          response.status(400).json({
            message: "Invalid housing data",
            issues: parsedInput.error.issues,
          })
          return
        }

        const trip = await tripRepository.getTrip(
          authenticatedRequest.user.id,
          authenticatedRequest.accessToken,
          tripId,
        )

        if (!trip) {
          response.status(404).json({ message: "Trip not found" })
          return
        }

        let housingInput = parsedInput.data

        if (housingInput.googleMapsUrl) {
          try {
            const place = await googlePlacesResolver(housingInput.googleMapsUrl)
            housingInput = {
              ...housingInput,
              name: housingInput.name || place.name,
              placeName: place.name,
              placeAddress: place.address,
              latitude: place.latitude,
              longitude: place.longitude,
            }
          } catch (error) {
            if (error instanceof GooglePlacesError) {
              response.status(error.statusCode).json({ message: error.message })
              return
            }
            throw error
          }
        }

        const housingStay = await tripRepository.createHousingStay(
          authenticatedRequest.user.id,
          authenticatedRequest.accessToken,
          tripId,
          housingInput,
        )

        if (!housingStay) {
          response.status(404).json({ message: "Trip not found" })
          return
        }

        response.status(201).json(HousingStaySchema.parse(housingStay))
      } catch (error) {
        next(error)
      }
    },
  )

  app.patch(
    "/api/trips/:tripId/housing/:housingStayId",
    (request, response, next) => requireAuthenticatedUser(authService, request, response, next),
    async (request: Request, response: Response, next: NextFunction) => {
      try {
        const authenticatedRequest = request as AuthenticatedRequest
        const { tripId, housingStayId } = request.params

        if (typeof tripId !== "string" || typeof housingStayId !== "string") {
          response.status(400).json({ message: "Trip and housing ids are required" })
          return
        }

        const parsedInput = UpdateHousingStayInputSchema.safeParse(request.body)

        if (!parsedInput.success) {
          response.status(400).json({
            message: "Invalid housing data",
            issues: parsedInput.error.issues,
          })
          return
        }

        const currentHousingStay = await tripRepository.getHousingStay(
          authenticatedRequest.user.id,
          authenticatedRequest.accessToken,
          tripId,
          housingStayId,
        )

        if (!currentHousingStay) {
          response.status(404).json({ message: "Housing stay not found" })
          return
        }

        const nextHousingStay = CreateHousingStayInputSchema.safeParse({
          name: currentHousingStay.name,
          checkIn: currentHousingStay.checkIn,
          checkOut: currentHousingStay.checkOut,
          isBackup: currentHousingStay.isBackup,
          notes: currentHousingStay.notes,
          googleMapsUrl: currentHousingStay.googleMapsUrl,
          placeName: currentHousingStay.placeName,
          placeAddress: currentHousingStay.placeAddress,
          latitude: currentHousingStay.latitude,
          longitude: currentHousingStay.longitude,
          priceAmount: currentHousingStay.priceAmount,
          priceCurrency: currentHousingStay.priceCurrency,
          website: currentHousingStay.website,
          ...parsedInput.data,
        })

        if (!nextHousingStay.success) {
          response.status(400).json({
            message: "Invalid housing data",
            issues: nextHousingStay.error.issues,
          })
          return
        }

        let housingInput = parsedInput.data

        if (parsedInput.data.googleMapsUrl) {
          try {
            const place = await googlePlacesResolver(parsedInput.data.googleMapsUrl)
            housingInput = {
              ...housingInput,
              placeName: place.name,
              placeAddress: place.address,
              latitude: place.latitude,
              longitude: place.longitude,
            }
          } catch (error) {
            if (error instanceof GooglePlacesError) {
              response.status(error.statusCode).json({ message: error.message })
              return
            }
            throw error
          }
        } else if (parsedInput.data.googleMapsUrl === null) {
          housingInput = {
            ...housingInput,
            placeName: null,
            placeAddress: null,
            latitude: null,
            longitude: null,
          }
        }

        const housingStay = await tripRepository.updateHousingStay(
          authenticatedRequest.user.id,
          authenticatedRequest.accessToken,
          tripId,
          housingStayId,
          housingInput,
        )

        if (!housingStay) {
          response.status(404).json({ message: "Housing stay not found" })
          return
        }

        response.json(HousingStaySchema.parse(housingStay))
      } catch (error) {
        next(error)
      }
    },
  )

  app.delete(
    "/api/trips/:tripId/housing/:housingStayId",
    (request, response, next) => requireAuthenticatedUser(authService, request, response, next),
    async (request: Request, response: Response, next: NextFunction) => {
      try {
        const authenticatedRequest = request as AuthenticatedRequest
        const { tripId, housingStayId } = request.params

        if (typeof tripId !== "string" || typeof housingStayId !== "string") {
          response.status(400).json({ message: "Trip and housing ids are required" })
          return
        }

        const deleted = await tripRepository.deleteHousingStay(
          authenticatedRequest.user.id,
          authenticatedRequest.accessToken,
          tripId,
          housingStayId,
        )

        if (!deleted) {
          response.status(404).json({ message: "Housing stay not found" })
          return
        }

        response.status(204).send()
      } catch (error) {
        next(error)
      }
    },
  )

  app.post(
    "/api/trips/:tripId/meals",
    (request, response, next) => requireAuthenticatedUser(authService, request, response, next),
    async (request: Request, response: Response, next: NextFunction) => {
      try {
        const authenticatedRequest = request as AuthenticatedRequest
        const { tripId } = request.params

        if (typeof tripId !== "string") {
          response.status(400).json({ message: "Trip id is required" })
          return
        }

        const parsedInput = CreateMealInputSchema.safeParse(request.body)

        if (!parsedInput.success) {
          response.status(400).json({
            message: "Invalid meal data",
            issues: parsedInput.error.issues,
          })
          return
        }

        const trip = await tripRepository.getTrip(
          authenticatedRequest.user.id,
          authenticatedRequest.accessToken,
          tripId,
        )

        if (!trip) {
          response.status(404).json({ message: "Trip not found" })
          return
        }

        if (parsedInput.data.tripDate && !isDateWithinTrip(trip, parsedInput.data.tripDate)) {
          response.status(400).json({ message: "The meal date must be within the trip dates" })
          return
        }

        let mealInput = parsedInput.data

        if (mealInput.googleMapsUrl) {
          try {
            const place = await googlePlacesResolver(mealInput.googleMapsUrl)
            mealInput = {
              ...mealInput,
              title: mealInput.title?.trim() || null,
              placeName: place.name,
              placeAddress: place.address,
              latitude: place.latitude,
              longitude: place.longitude,
            }
          } catch (error) {
            if (error instanceof GooglePlacesError) {
              response.status(error.statusCode).json({ message: error.message })
              return
            }
            throw error
          }
        }

        const meal = await tripRepository.createMeal(
          authenticatedRequest.user.id,
          authenticatedRequest.accessToken,
          tripId,
          mealInput,
        )

        if (!meal) {
          response.status(404).json({ message: "Trip not found" })
          return
        }

        response.status(201).json(MealSchema.parse(meal))
      } catch (error) {
        next(error)
      }
    },
  )

  app.patch(
    "/api/trips/:tripId/meals/:mealId",
    (request, response, next) => requireAuthenticatedUser(authService, request, response, next),
    async (request: Request, response: Response, next: NextFunction) => {
      try {
        const authenticatedRequest = request as AuthenticatedRequest
        const { tripId, mealId } = request.params

        if (typeof tripId !== "string" || typeof mealId !== "string") {
          response.status(400).json({ message: "Trip and meal ids are required" })
          return
        }

        const parsedInput = UpdateMealInputSchema.safeParse(request.body)

        if (!parsedInput.success) {
          response.status(400).json({
            message: "Invalid meal data",
            issues: parsedInput.error.issues,
          })
          return
        }

        const [trip, currentMeal] = await Promise.all([
          tripRepository.getTrip(
            authenticatedRequest.user.id,
            authenticatedRequest.accessToken,
            tripId,
          ),
          tripRepository.getMeal(
            authenticatedRequest.user.id,
            authenticatedRequest.accessToken,
            tripId,
            mealId,
          ),
        ])

        if (!trip || !currentMeal) {
          response.status(404).json({ message: "Meal not found" })
          return
        }

        const nextMeal = CreateMealInputSchema.safeParse({
          tripDate: currentMeal.tripDate,
          isBackup: currentMeal.isBackup,
          title: currentMeal.title,
          startTime: currentMeal.startTime,
          endTime: currentMeal.endTime,
          allDay: currentMeal.allDay,
          notes: currentMeal.notes,
          googleMapsUrl: currentMeal.googleMapsUrl,
          placeName: currentMeal.placeName,
          placeAddress: currentMeal.placeAddress,
          latitude: currentMeal.latitude,
          longitude: currentMeal.longitude,
          priceAmount: currentMeal.priceAmount,
          priceCurrency: currentMeal.priceCurrency,
          website: currentMeal.website,
          ...parsedInput.data,
        })

        if (!nextMeal.success) {
          response.status(400).json({
            message: "Invalid meal data",
            issues: nextMeal.error.issues,
          })
          return
        }

        if (nextMeal.data.tripDate && !isDateWithinTrip(trip, nextMeal.data.tripDate)) {
          response.status(400).json({ message: "The meal date must be within the trip dates" })
          return
        }

        let mealInput = parsedInput.data

        if (parsedInput.data.googleMapsUrl) {
          try {
            const place = await googlePlacesResolver(parsedInput.data.googleMapsUrl)
            mealInput = {
              ...mealInput,
              title:
                parsedInput.data.title === undefined
                  ? currentMeal.title
                  : parsedInput.data.title?.trim() || null,
              placeName: place.name,
              placeAddress: place.address,
              latitude: place.latitude,
              longitude: place.longitude,
            }
          } catch (error) {
            if (error instanceof GooglePlacesError) {
              response.status(error.statusCode).json({ message: error.message })
              return
            }
            throw error
          }
        } else if (parsedInput.data.googleMapsUrl === null) {
          mealInput = {
            ...mealInput,
            placeName: null,
            placeAddress: null,
            latitude: null,
            longitude: null,
          }
        }

        const meal = await tripRepository.updateMeal(
          authenticatedRequest.user.id,
          authenticatedRequest.accessToken,
          tripId,
          mealId,
          mealInput,
        )

        if (!meal) {
          response.status(404).json({ message: "Meal not found" })
          return
        }

        response.json(MealSchema.parse(meal))
      } catch (error) {
        next(error)
      }
    },
  )

  app.delete(
    "/api/trips/:tripId/meals/:mealId",
    (request, response, next) => requireAuthenticatedUser(authService, request, response, next),
    async (request: Request, response: Response, next: NextFunction) => {
      try {
        const authenticatedRequest = request as AuthenticatedRequest
        const { tripId, mealId } = request.params

        if (typeof tripId !== "string" || typeof mealId !== "string") {
          response.status(400).json({ message: "Trip and meal ids are required" })
          return
        }

        const deleted = await tripRepository.deleteMeal(
          authenticatedRequest.user.id,
          authenticatedRequest.accessToken,
          tripId,
          mealId,
        )

        if (!deleted) {
          response.status(404).json({ message: "Meal not found" })
          return
        }

        response.status(204).send()
      } catch (error) {
        next(error)
      }
    },
  )

  app.post(
    "/api/trips/:tripId/activities",
    (request, response, next) => requireAuthenticatedUser(authService, request, response, next),
    async (request: Request, response: Response, next: NextFunction) => {
      try {
        const authenticatedRequest = request as AuthenticatedRequest
        const { tripId } = request.params

        if (typeof tripId !== "string") {
          response.status(400).json({ message: "Trip id is required" })
          return
        }

        const parsedInput = CreateActivityInputSchema.safeParse(request.body)

        if (!parsedInput.success) {
          response.status(400).json({
            message: "Invalid activity data",
            issues: parsedInput.error.issues,
          })
          return
        }

        const trip = await tripRepository.getTrip(
          authenticatedRequest.user.id,
          authenticatedRequest.accessToken,
          tripId,
        )

        if (!trip) {
          response.status(404).json({ message: "Trip not found" })
          return
        }

        if (parsedInput.data.tripDate && !isDateWithinTrip(trip, parsedInput.data.tripDate)) {
          response.status(400).json({
            message: "The activity date must be within the trip dates",
          })
          return
        }

        let activityInput = parsedInput.data

        if (activityInput.googleMapsUrl) {
          try {
            const place = await googlePlacesResolver(activityInput.googleMapsUrl)
            activityInput = {
              ...activityInput,
              title: activityInput.title?.trim() || null,
              placeName: place.name,
              placeAddress: place.address,
              latitude: place.latitude,
              longitude: place.longitude,
            }
          } catch (error) {
            if (error instanceof GooglePlacesError) {
              response.status(error.statusCode).json({ message: error.message })
              return
            }
            throw error
          }
        }

        const activity = await tripRepository.createActivity(
          authenticatedRequest.user.id,
          authenticatedRequest.accessToken,
          tripId,
          activityInput,
        )

        if (!activity) {
          response.status(404).json({ message: "Trip not found" })
          return
        }

        response.status(201).json(ActivitySchema.parse(activity))
      } catch (error) {
        next(error)
      }
    },
  )

  app.patch(
    "/api/trips/:tripId/activities/reorder",
    (request, response, next) => requireAuthenticatedUser(authService, request, response, next),
    async (request: Request, response: Response, next: NextFunction) => {
      try {
        const authenticatedRequest = request as AuthenticatedRequest
        const { tripId } = request.params

        if (typeof tripId !== "string") {
          response.status(400).json({ message: "Trip id is required" })
          return
        }

        const parsedInput = ReorderActivitiesInputSchema.safeParse(request.body)

        if (!parsedInput.success) {
          response.status(400).json({
            message: "Invalid activity order data",
            issues: parsedInput.error.issues,
          })
          return
        }

        const activityIds = parsedInput.data.activities.map((activity) => activity.activityId)

        if (new Set(activityIds).size !== activityIds.length) {
          response.status(400).json({
            message: "Activity ids must be unique",
          })
          return
        }

        const trip = await tripRepository.getTrip(
          authenticatedRequest.user.id,
          authenticatedRequest.accessToken,
          tripId,
        )

        if (!trip) {
          response.status(404).json({ message: "Trip not found" })
          return
        }

        if (
          parsedInput.data.activities.some((activity) => !isDateWithinTrip(trip, activity.tripDate))
        ) {
          response.status(400).json({
            message: "The activity date must be within the trip dates",
          })
          return
        }

        const activities = await tripRepository.reorderActivities(
          authenticatedRequest.user.id,
          authenticatedRequest.accessToken,
          tripId,
          parsedInput.data,
        )

        if (!activities) {
          response.status(404).json({ message: "Activity not found" })
          return
        }

        response.json(ActivitySchema.array().parse(activities))
      } catch (error) {
        next(error)
      }
    },
  )

  app.patch(
    "/api/trips/:tripId/day-items/reorder",
    (request, response, next) => requireAuthenticatedUser(authService, request, response, next),
    async (request: Request, response: Response, next: NextFunction) => {
      try {
        const authenticatedRequest = request as AuthenticatedRequest
        const { tripId } = request.params

        if (typeof tripId !== "string") {
          response.status(400).json({ message: "Trip id is required" })
          return
        }

        const parsedInput = ReorderDayItemsInputSchema.safeParse(request.body)

        if (!parsedInput.success) {
          response.status(400).json({
            message: "Invalid day item order data",
            issues: parsedInput.error.issues,
          })
          return
        }

        const itemKeys = parsedInput.data.items.map((item) => `${item.itemType}:${item.itemId}`)

        if (new Set(itemKeys).size !== itemKeys.length) {
          response.status(400).json({
            message: "Day item ids must be unique",
          })
          return
        }

        const trip = await tripRepository.getTrip(
          authenticatedRequest.user.id,
          authenticatedRequest.accessToken,
          tripId,
        )

        if (!trip) {
          response.status(404).json({ message: "Trip not found" })
          return
        }

        if (parsedInput.data.items.some((item) => !isDateWithinTrip(trip, item.tripDate))) {
          response.status(400).json({
            message: "The day item date must be within the trip dates",
          })
          return
        }

        if (!hasValidTimedDayItemOrder(trip, parsedInput.data.items)) {
          response.status(400).json({
            message: "Timed day items must be ordered by start time",
          })
          return
        }

        const reorderedItems = await tripRepository.reorderDayItems(
          authenticatedRequest.user.id,
          authenticatedRequest.accessToken,
          tripId,
          parsedInput.data,
        )

        if (!reorderedItems) {
          response.status(404).json({ message: "Day item not found" })
          return
        }

        response.json({
          activities: ActivitySchema.array().parse(reorderedItems.activities),
          meals: MealSchema.array().parse(reorderedItems.meals),
        })
      } catch (error) {
        next(error)
      }
    },
  )

  app.patch(
    "/api/trips/:tripId/activities/:activityId",
    (request, response, next) => requireAuthenticatedUser(authService, request, response, next),
    async (request: Request, response: Response, next: NextFunction) => {
      try {
        const authenticatedRequest = request as AuthenticatedRequest
        const { tripId, activityId } = request.params

        if (typeof tripId !== "string" || typeof activityId !== "string") {
          response.status(400).json({ message: "Trip and activity ids are required" })
          return
        }

        const parsedInput = UpdateActivityInputSchema.safeParse(request.body)

        if (!parsedInput.success) {
          response.status(400).json({
            message: "Invalid activity data",
            issues: parsedInput.error.issues,
          })
          return
        }

        const [trip, currentActivity] = await Promise.all([
          tripRepository.getTrip(
            authenticatedRequest.user.id,
            authenticatedRequest.accessToken,
            tripId,
          ),
          tripRepository.getActivity(
            authenticatedRequest.user.id,
            authenticatedRequest.accessToken,
            tripId,
            activityId,
          ),
        ])

        if (!trip || !currentActivity) {
          response.status(404).json({ message: "Activity not found" })
          return
        }

        const nextActivity = {
          tripDate: currentActivity.tripDate,
          isBackup: currentActivity.isBackup,
          title: currentActivity.title,
          startTime: currentActivity.startTime,
          endTime: currentActivity.endTime,
          allDay: currentActivity.allDay,
          notes: currentActivity.notes,
          priceAmount: currentActivity.priceAmount,
          priceCurrency: currentActivity.priceCurrency,
          website: currentActivity.website,
          ...parsedInput.data,
        }
        const parsedNextActivity = CreateActivityInputSchema.safeParse(nextActivity)

        if (!parsedNextActivity.success) {
          response.status(400).json({
            message: "Invalid activity data",
            issues: parsedNextActivity.error.issues,
          })
          return
        }

        if (
          parsedNextActivity.data.tripDate &&
          !isDateWithinTrip(trip, parsedNextActivity.data.tripDate)
        ) {
          response.status(400).json({
            message: "The activity date must be within the trip dates",
          })
          return
        }

        let activityInput: UpdateActivityInput = parsedInput.data

        if (parsedInput.data.googleMapsUrl) {
          try {
            const place = await googlePlacesResolver(parsedInput.data.googleMapsUrl)
            activityInput = {
              ...activityInput,
              title:
                parsedInput.data.title === undefined
                  ? currentActivity.title
                  : parsedInput.data.title?.trim() || null,
              placeName: place.name,
              placeAddress: place.address,
              latitude: place.latitude,
              longitude: place.longitude,
            }
          } catch (error) {
            if (error instanceof GooglePlacesError) {
              response.status(error.statusCode).json({ message: error.message })
              return
            }
            throw error
          }
        } else if (parsedInput.data.googleMapsUrl === null) {
          activityInput = {
            ...activityInput,
            placeName: null,
            placeAddress: null,
            latitude: null,
            longitude: null,
          }
        }

        const activity = await tripRepository.updateActivity(
          authenticatedRequest.user.id,
          authenticatedRequest.accessToken,
          tripId,
          activityId,
          activityInput,
        )

        if (!activity) {
          response.status(404).json({ message: "Activity not found" })
          return
        }

        response.json(ActivitySchema.parse(activity))
      } catch (error) {
        next(error)
      }
    },
  )

  app.delete(
    "/api/trips/:tripId/activities/:activityId",
    (request, response, next) => requireAuthenticatedUser(authService, request, response, next),
    async (request: Request, response: Response, next: NextFunction) => {
      try {
        const authenticatedRequest = request as AuthenticatedRequest
        const { tripId, activityId } = request.params

        if (typeof tripId !== "string" || typeof activityId !== "string") {
          response.status(400).json({ message: "Trip and activity ids are required" })
          return
        }

        const activity = await tripRepository.getActivity(
          authenticatedRequest.user.id,
          authenticatedRequest.accessToken,
          tripId,
          activityId,
        )

        if (!activity) {
          response.status(404).json({ message: "Activity not found" })
          return
        }

        const deleted = await tripRepository.deleteActivity(
          authenticatedRequest.user.id,
          authenticatedRequest.accessToken,
          tripId,
          activityId,
        )

        if (!deleted) {
          response.status(404).json({ message: "Activity not found" })
          return
        }

        response.status(204).send()
      } catch (error) {
        next(error)
      }
    },
  )

  app.use((_request: Request, response: Response) => {
    response.status(404).json({ message: "Route not found" })
  })

  const errorHandler: ErrorRequestHandler = (error, _request, response, _next) => {
    console.error(error)
    const isLocalDevelopment = process.env.NODE_ENV !== "production"
    const message =
      isLocalDevelopment && error instanceof Error ? error.message : "Internal server error"

    response.status(500).json({ message })
  }

  app.use(errorHandler)

  return app
}
