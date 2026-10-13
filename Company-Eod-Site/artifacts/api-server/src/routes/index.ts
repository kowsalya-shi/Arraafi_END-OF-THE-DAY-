import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import usersRouter from "./users";
import teamsRouter from "./teams";
import eodRouter from "./eod";
import tasksRouter from "./tasks";
import dailyWorkRouter from "./dailyWork";
import trainingRouter from "./training";
import dashboardRouter from "./dashboard";
import notificationsRouter from "./notifications";
import notificationSettingsRouter from "./notificationSettings";
import systemSettingsRouter from "./systemSettings";
import auditRouter from "./audit";
import misRouter from "./mis";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(usersRouter);
router.use(teamsRouter);
router.use(eodRouter);
router.use(tasksRouter);
router.use(dailyWorkRouter);
router.use(trainingRouter);
router.use(dashboardRouter);
router.use(notificationsRouter);
router.use(notificationSettingsRouter);
router.use(systemSettingsRouter);
router.use(auditRouter);
router.use(misRouter);

export default router;
