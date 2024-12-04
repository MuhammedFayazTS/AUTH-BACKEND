//Handle the buisness logic

import { ErrorCode } from "../../common/enums/error-code.enum";
import { VerificationEnum } from "../../common/enums/verification-code.enum";
import { LoginDto, RegisterDto } from "../../common/interfaces/auth.interface";
import { BadRequestException } from "../../common/utils/catch-errors";
import { fortyFiveMinutesFromNow } from "../../common/utils/date-time";
import jwt from "jsonwebtoken";
import db from "../../database/database";
import { config } from "../../config/app.config";

export class AuthService {
  public async register(registerData: RegisterDto) {
    const { name, email, password } = registerData;
    const transaction = await db.createDBTransaction();

    const existingUser = await db.User.findOne({
      where: { email },
    });

    if (existingUser) {
      throw new BadRequestException(
        "User already exists with this email",
        ErrorCode.AUTH_EMAIL_ALREADY_EXISTS
      );
    }

    const newUser = await db.User.create(
      {
        name,
        email,
        password,
      },
      { transaction }
    );

    const userId = newUser.id;

    const userPreference = await db.UserPreference.create(
      {
        userId,
      },
      {
        transaction,
      }
    );

    const verificationCode = await db.VerificationCode.create(
      {
        userId,
        type: VerificationEnum.EMAIL_VERIFICATION,
        expiresAt: fortyFiveMinutesFromNow(),
      },
      { transaction }
    );

    transaction.commit();

    const userWithPreference = await db.User.findOne({
      where: { id: userId },
      include: [
        {
          model: db.UserPreference,
          as: "userPreference",
        },
      ],
    });

    return {
      user: userWithPreference.toJSON(),
    };
  }

  public async login(loginData: LoginDto) {
    const { email, password, userAgent } = loginData;
    const transaction = await db.createDBTransaction();

    const user = await db.User.findOne({
      where: { email },
    });

    if (!user) {
      throw new BadRequestException(
        "Invalid email or password provided",
        ErrorCode.AUTH_USER_NOT_FOUND
      );
    }

    const isPasswordValid = await user.comparePassword(password);

    if (!isPasswordValid) {
      throw new BadRequestException(
        "Invalid email or password provided",
        ErrorCode.AUTH_USER_NOT_FOUND
      );
    }

    // check if email user enabled 2Fa return user = null

    const session = await db.Session.create({
      userId: user.id,
      userAgent,
    });

    const accessToken = jwt.sign(
      { userId: user.id, sessionId: session.id },
      config.JWT.JWT_SECRET,
      {
        audience: ["user"],
        expiresIn: config.JWT.JWT_EXPIRES_IN,
      }
    );

    const refreshToken = jwt.sign(
      { sessionId: session.id },
      config.JWT.JWT_REFRESH_SECRET,
      {
        audience: ["user"],
        expiresIn: config.JWT.JWT_REFRESH_EXPIRES_IN,
      }
    );

    return {
      user,
      accessToken,
      refreshToken,
      mfaRequired:false
    };
  }
}
