import { Module } from '@nestjs/common';

import { OracleHcmService } from './oracle-hcm.service';

@Module({
  providers: [OracleHcmService],
  exports: [OracleHcmService],
})
export class OracleHcmModule {}
