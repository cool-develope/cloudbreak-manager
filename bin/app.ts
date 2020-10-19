#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from '@aws-cdk/core';
import { AppStack } from '../lib/app-stack';
import * as dotenv from 'dotenv';

dotenv.config({
  path: `.env.${process.env.TIFO_ENV || 'dev'}`,
});

const app = new cdk.App();
new AppStack(app, 'AppStack');
