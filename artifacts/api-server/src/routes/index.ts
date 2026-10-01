import { Router, type IRouter } from "express";
import healthRouter from "./health";
import requireAuth from "../middlewares/requireAuth";
import personalRouter from "./personal";
import insightsRouter from "./insights";

const router: IRouter = Router();

router.use(healthRouter);
router.use(requireAuth);
router.use(personalRouter);
router.use(insightsRouter);

export default router;
