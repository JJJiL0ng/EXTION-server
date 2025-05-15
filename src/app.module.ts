import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { FormulaModule } from './modules/formula/formula.module';
import { ArtifactModule } from './modules/artifact/artifact.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    FormulaModule,
    ArtifactModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}